import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { ShiprocketConfig } from './config';
import { ShiprocketAuth } from './shiprocket-auth';
import { logger } from './logger';

export interface ShiprocketProduct {
  id: number;
  sku: string;
  name: string;
  length?: string | number;
  breadth?: string | number;
  height?: string | number;
  weight?: string | number;
}

export class ShiprocketClient {
  private auth: ShiprocketAuth;
  private baseUrl: string;
  private maxRetries = 3;
  private baseBackoffMs = 1000;
  private requestSpacingMs = 250;
  private lastRequestTime = 0;

  constructor(config: ShiprocketConfig) {
    this.auth = new ShiprocketAuth(config);
    this.baseUrl = process.env.SHIPROCKET_API_BASE_URL || 'https://apiv2.shiprocket.in';
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    if (timeSinceLast < this.requestSpacingMs) {
      const wait = this.requestSpacingMs - timeSinceLast;
      await this.delay(wait);
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * General request helper with retries, 401 handling, and rate limiting.
   */
  public async request<T>(
    config: AxiosRequestConfig,
    retryCount = 0,
    hasRefreshedAuth = false
  ): Promise<AxiosResponse<T>> {
    await this.enforceRateLimit();

    let token: string;
    try {
      token = await this.auth.getToken();
    } catch (err) {
      logger.error(`Shiprocket API token retrieval failed: ${(err as Error).message}`);
      throw err;
    }

    const requestConfig: AxiosRequestConfig = {
      ...config,
      url: config.url?.startsWith('http') ? config.url : `${this.baseUrl}${config.url}`,
      headers: {
        ...config.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    };

    try {
      return await axios(requestConfig);
    } catch (err: any) {
      const status = err.response?.status;
      const responseData = err.response?.data;
      const errorMsg = responseData?.message || err.message;

      // 401 handler
      if (status === 401 && !hasRefreshedAuth) {
        logger.warn('Received 401 Unauthorized from Shiprocket API. Clearing cached token and retrying...');
        this.auth.clearCache();
        try {
          await this.auth.login();
          return await this.request<T>(config, retryCount, true);
        } catch (authErr) {
          logger.error(`Re-authentication failed during 401 retry: ${(authErr as Error).message}`);
          throw authErr;
        }
      }

      // Retryable statuses: 429, 5xx
      const isRetryable = status === 429 || (status >= 500 && status <= 599);
      if (isRetryable && retryCount < this.maxRetries) {
        const backoff = this.baseBackoffMs * Math.pow(2, retryCount) * (0.8 + Math.random() * 0.4);
        logger.warn(`Request failed with status ${status}. Retrying in ${Math.round(backoff)}ms...`);
        await this.delay(backoff);
        return this.request<T>(config, retryCount + 1, hasRefreshedAuth);
      }

      throw err;
    }
  }

  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.request<T>({ ...config, method: 'GET', url });
  }

  /**
   * Fetches all products from Shiprocket.
   */
  public async fetchAllProducts(): Promise<ShiprocketProduct[]> {
    logger.info('Fetching product catalog from Shiprocket...');
    
    const products: ShiprocketProduct[] = [];
    let page = 1;
    let totalPages = 1;
    let fetchedAll = false;

    while (page <= totalPages && !fetchedAll) {
      logger.debug(`Fetching Shiprocket products page ${page} of ${totalPages}...`);
      
      try {
        const response = await this.get<{
          data: ShiprocketProduct[];
          meta?: { pagination?: { total_pages?: number } };
        }>(`/v1/external/products?page=${page}&per_page=100`);

        const data = response.data?.data || [];
        products.push(...data);

        totalPages = response.data?.meta?.pagination?.total_pages || 1;
        page++;
      } catch (err: any) {
        const errorMsg = err.response?.data?.message || err.message;
        throw new Error(`Failed to fetch products from Shiprocket: ${errorMsg}`);
      }
    }

    logger.info(`Fetched ${products.length} product(s) from Shiprocket catalog.`);
    return products;
  }

  /**
   * Fetches active channel integrations.
   */
  public async fetchChannels(): Promise<any[]> {
    logger.info('Fetching channels list from Shiprocket...');
    try {
      const response = await this.get<{ data: any[] }>('/v1/external/channels');
      return response.data?.data || [];
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message;
      throw new Error(`Failed to fetch channels from Shiprocket: ${errorMsg}`);
    }
  }
}
