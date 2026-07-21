import * as dotenv from 'dotenv';
dotenv.config();

export interface ShopifyConfig {
  storeDomain: string;
  clientId: string;
  clientSecret: string;
  apiVersion: string;
}

export interface UniversalDimensions {
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  weightKg: number;
}

export interface ChannelConfig {
  forceChannelName: boolean;
  shiprocketChannelName: string;
  shiprocketUploadChannelName: string;
}

export interface AppConfig {
  shopify: ShopifyConfig;
  universal: UniversalDimensions;
  channel: ChannelConfig;
}

export function normalizeDomain(domain: string): string {
  let d = domain.trim();
  if (d.startsWith('http://')) d = d.substring(7);
  if (d.startsWith('https://')) d = d.substring(8);
  if (d.endsWith('/')) d = d.substring(0, d.length - 1);
  return d;
}

function parsePositiveNumberEnv(name: string): number {
  const value = parseFloat(process.env[name] || '');
  if (isNaN(value) || value <= 0) {
    throw new Error(`${name} must be a number greater than 0.`);
  }
  return value;
}

function parseBooleanEnv(value: string | undefined): boolean {
  return ['true', '1', 'yes', 'y'].includes((value || '').trim().toLowerCase());
}

export function loadUniversalDimensions(): UniversalDimensions {
  return {
    lengthCm: parsePositiveNumberEnv('UNIVERSAL_LENGTH_CM'),
    breadthCm: parsePositiveNumberEnv('UNIVERSAL_BREADTH_CM'),
    heightCm: parsePositiveNumberEnv('UNIVERSAL_HEIGHT_CM'),
    weightKg: parsePositiveNumberEnv('UNIVERSAL_WEIGHT_KG'),
  };
}

export function loadChannelConfig(): ChannelConfig {
  return {
    forceChannelName: parseBooleanEnv(process.env.FORCE_CHANNEL_NAME),
    shiprocketChannelName: process.env.SHIPROCKET_CHANNEL_NAME || '',
    shiprocketUploadChannelName: process.env.SHIPROCKET_UPLOAD_CHANNEL_NAME || '',
  };
}

export function loadShopifyConfig(): ShopifyConfig {
  const rawStoreDomain = process.env.SHOPIFY_STORE_DOMAIN || '';
  const storeDomain = normalizeDomain(rawStoreDomain);
  
  const clientId = process.env.SHOPIFY_CLIENT_ID || '';
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET || '';
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-04';

  // Validate Shopify
  if (!storeDomain || storeDomain.includes('store-name.myshopify.com')) {
    throw new Error('Invalid or missing SHOPIFY_STORE_DOMAIN. Please set it in your .env file.');
  }
  if (!clientId || clientId.startsWith('your_client_id')) {
    throw new Error('Invalid or missing SHOPIFY_CLIENT_ID. Please set it in your .env file.');
  }
  if (!clientSecret || clientSecret.startsWith('your_client_secret')) {
    throw new Error('Invalid or missing SHOPIFY_CLIENT_SECRET. Please set it in your .env file.');
  }

  return {
    storeDomain,
    clientId,
    clientSecret,
    apiVersion,
  };
}

export function loadConfig(): AppConfig {
  return {
    shopify: loadShopifyConfig(),
    universal: loadUniversalDimensions(),
    channel: loadChannelConfig(),
  };
}
