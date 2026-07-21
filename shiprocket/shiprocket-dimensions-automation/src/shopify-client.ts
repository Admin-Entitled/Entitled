import axios, { AxiosResponse } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { ShopifyConfig } from './config';
import { logger } from './logger';

export interface ShopifyVariant {
  productId: string;
  productTitle: string;
  productStatus: string;
  variantId: string;
  variantTitle: string;
  sku: string;
}

export interface ShopifyTokenCache {
  accessToken: string;
  expiresAt: number;
  scopes: string;
}

export class ShopifyClient {
  private config: ShopifyConfig;
  private url: string;
  private tokenCachePath: string;

  constructor(config: ShopifyConfig) {
    this.config = config;
    this.tokenCachePath = path.resolve(__dirname, '../.cache/shopify-token.json');
    this.url = `https://${config.storeDomain}/admin/api/${config.apiVersion}/graphql.json`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public clearTokenCache(): void {
    try {
      if (fs.existsSync(this.tokenCachePath)) {
        fs.unlinkSync(this.tokenCachePath);
        logger.debug('Shopify token cache cleared.');
      }
    } catch (err) {
      logger.error(`Failed to clear Shopify token cache: ${(err as Error).message}`);
    }
  }

  public async getAccessToken(): Promise<string> {
    if (fs.existsSync(this.tokenCachePath)) {
      try {
        const cacheData = fs.readFileSync(this.tokenCachePath, 'utf8');
        const cache = JSON.parse(cacheData) as ShopifyTokenCache;
        
        const bufferMs = 5 * 60 * 1000;
        if (cache && cache.accessToken && cache.expiresAt > Date.now() + bufferMs) {
          logger.debug('Using cached Shopify access token.');
          return cache.accessToken;
        }
        logger.info('Cached Shopify token is expired or close to expiry. Refreshing...');
      } catch (err) {
        logger.debug(`Failed to parse Shopify token cache: ${(err as Error).message}`);
      }
    }

    logger.info('Requesting new Shopify access token...');
    const authUrl = `https://${this.config.storeDomain}/admin/oauth/access_token`;
    
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', this.config.clientId);
    params.append('client_secret', this.config.clientSecret);

    try {
      const response = await axios.post(authUrl, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const { access_token, scope, expires_in } = response.data || {};
      if (!access_token) {
        throw new Error('OAuth response did not contain an access_token.');
      }

      const scopesStr = scope || '';
      const scopes = scopesStr.split(',').map((s: string) => s.trim());
      if (!scopes.includes('read_products') && !scopes.includes('write_products')) {
        throw new Error(`Insufficient Shopify API scopes. Expected "read_products" or "write_products", got "${scopesStr}".`);
      }

      const expiresAt = Date.now() + (expires_in || 86399) * 1000;
      const cache: ShopifyTokenCache = {
        accessToken: access_token,
        expiresAt,
        scopes: scopesStr,
      };

      const dir = path.dirname(this.tokenCachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.tokenCachePath, JSON.stringify(cache, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });

      logger.info('Shopify access token obtained and cached successfully.');
      return access_token;
    } catch (err: any) {
      const errMsg = err.response?.data?.error_description || err.response?.data?.error || err.message;
      throw new Error(`Shopify Authentication failed: ${errMsg}`);
    }
  }

  private async executeGqlQuery(query: string, variables: any, retryCount = 0): Promise<any> {
    const token = await this.getAccessToken();

    try {
      const response: AxiosResponse<any> = await axios.post(
        this.url,
        { query, variables },
        {
          headers: {
            'X-Shopify-Access-Token': token,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.errors) {
        const errors = response.data.errors;
        const isThrottled = errors.some((e: any) => e.message?.toLowerCase().includes('throttled') || e.extensions?.code === 'THROTTLED');
        if (isThrottled && retryCount < 3) {
          logger.warn('Shopify GraphQL query throttled by extensions. Waiting 5 seconds to retry...');
          await this.sleep(5000);
          return this.executeGqlQuery(query, variables, retryCount + 1);
        }
        throw new Error(`Shopify GraphQL User Error: ${JSON.stringify(errors)}`);
      }

      const cost = response.data?.extensions?.cost;
      if (cost && cost.throttleStatus) {
        const { requestedQueryCost, throttleStatus } = cost;
        const { currentlyAvailable, restoreRate } = throttleStatus;
        
        logger.debug(`Shopify GQL Cost - Requested: ${requestedQueryCost}, Available: ${currentlyAvailable}, Restore: ${restoreRate}`);

        if (currentlyAvailable < requestedQueryCost + 10) {
          const needed = (requestedQueryCost + 10) - currentlyAvailable;
          const waitMs = Math.ceil(needed / restoreRate) * 1000 + 500;
          logger.warn(`Shopify GQL rate limit capacity low. Sleeping for ${waitMs}ms to restore points...`);
          await this.sleep(waitMs);
        }
      }

      return response.data;
    } catch (err: any) {
      const status = err.response?.status;

      if (status === 401 && retryCount < 1) {
        logger.warn('Shopify GQL returned 401. Clearing token cache and retrying...');
        this.clearTokenCache();
        return this.executeGqlQuery(query, variables, retryCount + 1);
      }

      if (status === 429 && retryCount < 3) {
        const retryAfter = parseInt(err.response.headers['retry-after'] || '5', 10);
        logger.warn(`Shopify GQL throttled with HTTP 429. Waiting ${retryAfter}s to retry...`);
        await this.sleep(retryAfter * 1000);
        return this.executeGqlQuery(query, variables, retryCount + 1);
      }

      const errorDetails = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      throw new Error(`Shopify GraphQL Request failed: ${errorDetails}`);
    }
  }

  public async getShopIdentity(): Promise<string> {
    const query = `
      query {
        shop {
          name
          myshopifyDomain
        }
      }
    `;
    const response = await this.executeGqlQuery(query, {});
    return response.data?.shop?.name || 'Unknown Shop';
  }

  public async fetchActiveVariants(options: { includeArchivedAndDrafts?: boolean } = {}): Promise<ShopifyVariant[]> {
    logger.info('Fetching product variants from Shopify...');
    
    const variants: ShopifyVariant[] = [];
    let hasNextPage = true;
    let cursor: string | null = null;
    let pageCount = 0;

    const query = `
      query getProducts($cursor: String) {
        products(first: 50, after: $cursor) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              status
              variants(first: 100) {
                edges {
                  node {
                    id
                    title
                    sku
                  }
                }
              }
            }
          }
        }
      }
    `;

    while (hasNextPage) {
      pageCount++;
      logger.debug(`Fetching page ${pageCount} of products from Shopify...`);
      
      const response = await this.executeGqlQuery(query, { cursor });

      const productsData = response?.data?.products;
      if (!productsData) {
        throw new Error('Invalid GraphQL response structure from Shopify.');
      }

      const edges = productsData.edges || [];
      for (const edge of edges) {
        const product = edge.node;
        const status = (product.status || '').toUpperCase();

        const isEligibleStatus = options.includeArchivedAndDrafts
          ? true
          : status === 'ACTIVE';

        if (!isEligibleStatus) {
          continue;
        }

        const variantEdges = product.variants?.edges || [];
        for (const varEdge of variantEdges) {
          const variant = varEdge.node;
          
          const rawSku = variant.sku || '';
          const normalizedSku = rawSku.trim();

          variants.push({
            productId: product.id,
            productTitle: product.title,
            productStatus: product.status,
            variantId: variant.id,
            variantTitle: variant.title,
            sku: normalizedSku,
          });
        }
      }

      hasNextPage = productsData.pageInfo.hasNextPage;
      cursor = productsData.pageInfo.endCursor;
    }

    logger.info(`Pulled ${variants.length} raw variant(s) from Shopify.`);

    return this.validateAndFilterVariants(variants);
  }

  private validateAndFilterVariants(variants: ShopifyVariant[]): ShopifyVariant[] {
    const validVariants: ShopifyVariant[] = [];
    const skuMap = new Map<string, ShopifyVariant[]>();
    const blankSkus: string[] = [];

    for (const v of variants) {
      if (!v.sku) {
        blankSkus.push(`Product: "${v.productTitle}", Variant: "${v.variantTitle}" (ID: ${v.variantId})`);
        continue;
      }

      const existing = skuMap.get(v.sku) || [];
      existing.push(v);
      skuMap.set(v.sku, existing);
      validVariants.push(v);
    }

    if (blankSkus.length > 0) {
      logger.warn(`Found ${blankSkus.length} variant(s) with blank SKUs. They will be ignored during synchronization.`);
      logger.debug(`Blank SKUs details:\n${blankSkus.join('\n')}`);
    }

    const duplicateReports: string[] = [];
    for (const [sku, list] of skuMap.entries()) {
      if (list.length > 1) {
        const entries = list.map((item) => `[Product: "${item.productTitle}" | Variant: "${item.variantTitle}"]`).join(', ');
        duplicateReports.push(`SKU "${sku}" is duplicated on: ${entries}`);
      }
    }

    if (duplicateReports.length > 0) {
      const errorMsg = `Duplicate Shopify SKUs detected! Synchronization aborted.\n${duplicateReports.join('\n')}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    return validVariants.filter((v) => v.sku.length > 0);
  }
}
