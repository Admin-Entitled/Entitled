import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

export interface ShiprocketChannel {
  id: number;
  name: string;
  base_channel_code: string;
  status: number; // e.g. 1 for active
}

export class ShiprocketClient {
  private email = process.env.SHIPROCKET_API_EMAIL || '';
  private password = process.env.SHIPROCKET_API_PASSWORD || '';
  private baseUrl = 'https://apiv2.shiprocket.in';
  private tokenCachePath = path.resolve(__dirname, '../.cache/shiprocket-token.json');

  private decodeExpiration(token: string): number | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decodedJson = Buffer.from(normalized, 'base64').toString('utf8');
      const payload = JSON.parse(decodedJson);
      if (payload && typeof payload.exp === 'number') {
        return payload.exp * 1000;
      }
      return null;
    } catch {
      return null;
    }
  }

  public async getAccessToken(): Promise<string> {
    if (fs.existsSync(this.tokenCachePath)) {
      try {
        const data = fs.readFileSync(this.tokenCachePath, 'utf8');
        const cache = JSON.parse(data);
        const bufferMs = 30 * 60 * 1000; // 30 mins
        if (cache && cache.token && cache.expiresAt > Date.now() + bufferMs) {
          logger.debug('Using cached Shiprocket token.');
          return cache.token;
        }
      } catch {}
    }

    if (!this.email || !this.password) {
      throw new Error(
        'Missing Shiprocket API credentials. Please set SHIPROCKET_API_EMAIL and SHIPROCKET_API_PASSWORD in your .env file.'
      );
    }

    logger.info('Requesting new Shiprocket authentication token...');
    try {
      const response = await axios.post(`${this.baseUrl}/v1/external/auth/login`, {
        email: this.email,
        password: this.password,
      }, {
        headers: { 'Content-Type': 'application/json' },
      });

      const token = response.data?.token;
      if (!token) {
        throw new Error('Authentication response did not contain a token.');
      }

      const expiresAt = this.decodeExpiration(token) || (Date.now() + 9 * 24 * 60 * 60 * 1000);

      const dir = path.dirname(this.tokenCachePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(this.tokenCachePath, JSON.stringify({ token, expiresAt }, null, 2), {
        encoding: 'utf8',
        mode: 0o600,
      });

      logger.info('Shiprocket token successfully cached.');
      return token;
    } catch (err: any) {
      const responseData = err.response?.data;
      const errorMsg = responseData?.message || err.message;
      if (
        (typeof errorMsg === 'string' && errorMsg.includes('Invalid email and password combination')) ||
        (responseData && typeof responseData.error === 'string' && responseData.error.includes('Invalid email and password combination'))
      ) {
        console.error('\n❌ Use credentials for a Shiprocket API User created under Settings → API. Do not use the main Shiprocket login.\n');
        throw new Error('Invalid email and password combination. Use credentials for a Shiprocket API User created under Settings → API. Do not use the main Shiprocket login.');
      }
      throw new Error(`Shiprocket Login failed: ${errorMsg}`);
    }
  }

  public async fetchChannels(): Promise<ShiprocketChannel[]> {
    const token = await this.getAccessToken();
    try {
      const response = await axios.get(`${this.baseUrl}/v1/external/channels`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const rawChannels = response.data?.data || [];
      return rawChannels.map((c: any) => ({
        id: Number(c.id || c.channel_id),
        name: String(c.name || ''),
        base_channel_code: String(c.base_channel_code || ''),
        status: Number(c.status ?? 1),
      }));
    } catch (err: any) {
      throw new Error(`Failed to fetch channels from Shiprocket: ${err.message}`);
    }
  }
}
