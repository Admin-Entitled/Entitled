import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { ShiprocketConfig } from './config';
import { logger } from './logger';

export interface TokenCache {
  token: string;
  expiresAt: number;
}

export class ShiprocketAuth {
  private config: ShiprocketConfig;
  private cachePath: string;
  private baseUrl: string;

  constructor(config: ShiprocketConfig) {
    this.config = config;
    this.cachePath = path.resolve(__dirname, '../.cache/shiprocket-token.json');
    this.baseUrl = process.env.SHIPROCKET_API_BASE_URL || 'https://apiv2.shiprocket.in';
  }

  private decodeExpiration(token: string): number | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      
      const payloadBase64 = parts[1];
      const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const decodedJson = Buffer.from(normalized, 'base64').toString('utf8');
      const payload = JSON.parse(decodedJson);
      
      if (payload && typeof payload.exp === 'number') {
        return payload.exp * 1000;
      }
      return null;
    } catch (err) {
      logger.debug(`Failed to decode JWT: ${(err as Error).message}`);
      return null;
    }
  }

  private getCachedToken(): TokenCache | null {
    if (!fs.existsSync(this.cachePath)) {
      return null;
    }
    try {
      const data = fs.readFileSync(this.cachePath, 'utf8');
      const cache = JSON.parse(data) as TokenCache;
      if (cache && cache.token && typeof cache.expiresAt === 'number') {
        return cache;
      }
      return null;
    } catch (err) {
      logger.debug(`Failed to read token cache: ${(err as Error).message}`);
      return null;
    }
  }

  private writeTokenCache(token: string, expiresAt: number) {
    try {
      const dir = path.dirname(this.cachePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const cache: TokenCache = { token, expiresAt };
      fs.writeFileSync(this.cachePath, JSON.stringify(cache, null, 2), 'utf8');
    } catch (err) {
      logger.error(`Failed to cache token to disk: ${(err as Error).message}`);
    }
  }

  public clearCache() {
    try {
      if (fs.existsSync(this.cachePath)) {
        fs.unlinkSync(this.cachePath);
        logger.debug('Token cache cleared.');
      }
    } catch (err) {
      logger.error(`Failed to clear token cache: ${(err as Error).message}`);
    }
  }

  public async login(): Promise<string> {
    if (!this.config.email || !this.config.password) {
      throw new Error(
        'Missing Shiprocket API credentials. Please set SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD in your .env file.'
      );
    }

    logger.info('Authenticating with Shiprocket API...');
    
    try {
      const response = await axios.post(`${this.baseUrl}/v1/external/auth/login`, {
        email: this.config.email,
        password: this.config.password,
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const token = response.data?.token;
      if (!token) {
        throw new Error('Authentication response did not contain a token.');
      }

      const expiresAt = this.decodeExpiration(token) || (Date.now() + 9 * 24 * 60 * 60 * 1000);
      this.writeTokenCache(token, expiresAt);
      logger.info('Shiprocket API authenticated successfully.');
      return token;
    } catch (err: any) {
      const errorMsg = err.response?.data?.message || err.message;
      throw new Error(`Shiprocket API Login failed: ${errorMsg}`);
    }
  }

  public async getToken(): Promise<string> {
    const cached = this.getCachedToken();
    
    if (cached) {
      const bufferTime = 30 * 60 * 1000;
      const isExpired = cached.expiresAt <= Date.now() + bufferTime;
      
      if (!isExpired) {
        logger.debug('Using cached Shiprocket API token.');
        return cached.token;
      }
      logger.info('Cached API token is expired or close to expiry. Re-authenticating...');
    }

    return this.login();
  }
}
