import * as dotenv from 'dotenv';
dotenv.config();

export interface ShopifyConfig {
  storeDomain: string;
  clientId: string;
  clientSecret: string;
  apiVersion: string;
}

export interface ShiprocketConfig {
  email: string;
  password: string;
  channelName: string;
  syncWaitMinutes: number;
}

export interface UniversalDimensions {
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  weightKg: number;
}

export interface AppConfig {
  shopify: ShopifyConfig;
  shiprocket: ShiprocketConfig;
  universal: UniversalDimensions;
  headless: boolean;
}

function normalizeDomain(domain: string): string {
  let d = domain.trim();
  if (d.startsWith('http://')) d = d.substring(7);
  if (d.startsWith('https://')) d = d.substring(8);
  if (d.endsWith('/')) d = d.substring(0, d.length - 1);
  return d;
}

export function loadConfig(): AppConfig {
  const rawStoreDomain = process.env.SHOPIFY_STORE_DOMAIN || '';
  const storeDomain = normalizeDomain(rawStoreDomain);
  
  const clientId = process.env.SHOPIFY_CLIENT_ID || '';
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

  const email = process.env.SHIPROCKET_API_EMAIL || '';
  const password = process.env.SHIPROCKET_API_PASSWORD || '';
  const channelName = process.env.SHIPROCKET_CHANNEL_NAME || 'Shopify';
  const syncWaitMinutes = parseInt(process.env.SHIPROCKET_SYNC_WAIT_MINUTES || '30', 10);

  const lengthCm = parseFloat(process.env.UNIVERSAL_LENGTH_CM || '');
  const breadthCm = parseFloat(process.env.UNIVERSAL_BREADTH_CM || '');
  const heightCm = parseFloat(process.env.UNIVERSAL_HEIGHT_CM || '');
  const weightKg = parseFloat(process.env.UNIVERSAL_WEIGHT_KG || '');

  const headless = process.env.HEADLESS !== 'false'; // defaults to true unless explicitly false

  // Validate Shopify
  if (!storeDomain || storeDomain.includes('store-name.myshopify.com')) {
    throw new Error('Invalid or missing SHOPIFY_STORE_DOMAIN. Please set it in your .env file.');
  }
  if (!clientId) {
    throw new Error('Invalid or missing SHOPIFY_CLIENT_ID. Please set it in your .env file.');
  }
  if (!clientSecret) {
    throw new Error('Invalid or missing SHOPIFY_CLIENT_SECRET. Please set it in your .env file.');
  }

  // Validate Shiprocket Credentials
  if (!email || email.includes('api-user-email')) {
    throw new Error('Invalid or missing SHIPROCKET_API_EMAIL. Please set it in your .env file.');
  }
  if (!password || password.includes('api_user_password')) {
    throw new Error('Invalid or missing SHIPROCKET_API_PASSWORD. Please set it in your .env file.');
  }

  // Validate Universal Dimensions
  if (isNaN(lengthCm) || lengthCm <= 0.5) {
    throw new Error('UNIVERSAL_LENGTH_CM must be a number greater than 0.5 cm.');
  }
  if (isNaN(breadthCm) || breadthCm <= 0.5) {
    throw new Error('UNIVERSAL_BREADTH_CM must be a number greater than 0.5 cm.');
  }
  if (isNaN(heightCm) || heightCm <= 0.5) {
    throw new Error('UNIVERSAL_HEIGHT_CM must be a number greater than 0.5 cm.');
  }
  if (isNaN(weightKg) || weightKg <= 0) {
    throw new Error('UNIVERSAL_WEIGHT_KG must be a number greater than 0 kg.');
  }

  return {
    shopify: {
      storeDomain,
      clientId,
      clientSecret,
      apiVersion,
    },
    shiprocket: {
      email,
      password,
      channelName,
      syncWaitMinutes,
    },
    universal: {
      lengthCm,
      breadthCm,
      heightCm,
      weightKg,
    },
    headless,
  };
}
