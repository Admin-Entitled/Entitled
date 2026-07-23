import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../../");
const rootEnvPath = path.resolve(__dirname, "../../../.env");
const serverEnvPath = path.resolve(__dirname, "../../.env");

const envLoadReport = {
  rootEnvExists: fs.existsSync(rootEnvPath),
  serverEnvExists: fs.existsSync(serverEnvPath),
};

if (envLoadReport.rootEnvExists) {
  dotenv.config({ path: rootEnvPath });
}

if (envLoadReport.serverEnvExists) {
  dotenv.config({ path: serverEnvPath, override: true });
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveSqlitePath(value) {
  if (!value) {
    return path.resolve(repoRoot, "server/data/app.db");
  }

  if (path.isAbsolute(value)) {
    return value;
  }

  return path.resolve(repoRoot, value);
}

export const env = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  sqlitePath: resolveSqlitePath(process.env.SQLITE_PATH),
  databaseUrl: (process.env.DATABASE_URL || "").trim(),
  directDatabaseUrl: (process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "").trim(),
  orderMappingSchema: (process.env.ORDER_MAPPING_SCHEMA || "order_mapping").trim(),
  orderMappingRoute: "/order-mapping",
  shopifyStoreDomain: (process.env.SHOPIFY_STORE_DOMAIN || "").trim(),
  shopifyClientId: (process.env.SHOPIFY_CLIENT_ID || "").trim(),
  shopifyClientSecret: (process.env.SHOPIFY_CLIENT_SECRET || "").trim(),
  shopifyAdminAccessToken: (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || "").trim(),
  shopifyApiVersion: (process.env.SHOPIFY_API_VERSION || "2026-04").trim(),
  analyticsDays: Number(process.env.SHOPIFY_ANALYTICS_DAYS || 365),
  shiprocketEmail: (process.env.SHIPROCKET_EMAIL || "").trim(),
  shiprocketPassword: (process.env.SHIPROCKET_PASSWORD || "").trim(),
  shiprocketToken: (process.env.SHIPROCKET_TOKEN || "").trim(),
  shiprocketBaseUrl: (process.env.SHIPROCKET_BASE_URL || "https://apiv2.shiprocket.in").trim(),
  shiprocketChannelId: (process.env.SHIPROCKET_CHANNEL_ID || "").trim(),
};

export function ensureShopifyEnv() {
  requireEnv("SHOPIFY_STORE_DOMAIN");
  requireEnv("SHOPIFY_CLIENT_ID");
  requireEnv("SHOPIFY_CLIENT_SECRET");
}

export { envLoadReport };
