import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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

export class EnvValidationError extends Error {
  constructor(message, invalidVariables = []) {
    super(message);
    this.name = "EnvValidationError";
    this.invalidVariables = invalidVariables;
  }
}

function parseString(value, defaultValue = "") {
  if (value === undefined || value === null) {
    return defaultValue;
  }
  const trimmed = String(value).trim();
  return trimmed;
}

function parsePort(value, defaultValue = 4000, varName = "PORT") {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 65535) {
    throw new EnvValidationError(`Invalid port number for ${varName}: ${value}`, [varName]);
  }
  return num;
}

function parseIntVal(value, defaultValue = 365, varName = "SHOPIFY_ANALYTICS_DAYS") {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1) {
    throw new EnvValidationError(`Invalid integer for ${varName}: ${value}`, [varName]);
  }
  return num;
}

function parseBool(value, defaultValue = false) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return defaultValue;
  }
  const str = String(value).trim().toLowerCase();
  if (str === "true" || str === "1") return true;
  if (str === "false" || str === "0") return false;
  throw new EnvValidationError(`Invalid boolean value: ${value}`);
}

function parseUrl(value, defaultValue = "", varName = "CLIENT_ORIGIN", required = false) {
  const str = parseString(value, defaultValue);
  if (!str) {
    if (required) {
      throw new EnvValidationError(`Missing required URL for ${varName}`, [varName]);
    }
    return "";
  }
  try {
    new URL(str);
    return str;
  } catch (err) {
    throw new EnvValidationError(`Invalid URL for ${varName}: ${str}`, [varName]);
  }
}

function parseEnum(value, defaultValue, allowedValues, varName = "NODE_ENV") {
  const str = parseString(value, defaultValue);
  if (!allowedValues.includes(str)) {
    throw new EnvValidationError(`Invalid enum value for ${varName}: '${str}'. Expected one of: ${allowedValues.join(", ")}`, [varName]);
  }
  return str;
}

function resolvePath(value, defaultRelativePath) {
  if (!value || String(value).trim() === "") {
    return path.resolve(repoRoot, defaultRelativePath);
  }

  const trimmed = String(value).trim();
  if (path.isAbsolute(trimmed)) {
    return path.resolve(trimmed);
  }

  return path.resolve(repoRoot, trimmed);
}

function resolveSqlitePath(value) {
  return resolvePath(value, "server/data/app.db");
}

export function validateEnv(customEnv = process.env, options = {}) {
  const isProd = options.isProduction ?? (customEnv.NODE_ENV === "production");
  const invalidVars = [];

  const nodeEnv = parseEnum(customEnv.NODE_ENV, "development", ["development", "production", "test"], "NODE_ENV");
  const port = parsePort(customEnv.PORT, 4000, "PORT");
  const clientOrigin = parseUrl(customEnv.CLIENT_ORIGIN, "http://localhost:5173", "CLIENT_ORIGIN", isProd);

  if (isProd) {
    if (customEnv.SHOPIFY_STORE_DOMAIN !== undefined && parseString(customEnv.SHOPIFY_STORE_DOMAIN) === "") {
      invalidVars.push("SHOPIFY_STORE_DOMAIN");
    }
  }

  if (invalidVars.length > 0) {
    throw new EnvValidationError(`Environment validation failed for variables: ${invalidVars.join(", ")}`, invalidVars);
  }

  return {
    nodeEnv,
    port,
    clientOrigin,
  };
}

const overrides = {};

export function resetEnvOverrides() {
  for (const key of Object.keys(overrides)) {
    delete overrides[key];
  }
}

export const env = {
  get nodeEnv() { return overrides.nodeEnv ?? parseEnum(process.env.NODE_ENV, "development", ["development", "production", "test"], "NODE_ENV"); },
  set nodeEnv(v) { overrides.nodeEnv = parseEnum(v, "development", ["development", "production", "test"], "NODE_ENV"); },
  get port() { return overrides.port ?? parsePort(process.env.PORT, 4000, "PORT"); },
  set port(v) { overrides.port = parsePort(v, 4000, "PORT"); },
  get clientOrigin() { return overrides.clientOrigin ?? parseUrl(process.env.CLIENT_ORIGIN, "http://localhost:5173", "CLIENT_ORIGIN"); },
  set clientOrigin(v) { overrides.clientOrigin = parseUrl(v, "http://localhost:5173", "CLIENT_ORIGIN"); },
  get sqlitePath() { return overrides.sqlitePath ?? resolveSqlitePath(process.env.SQLITE_PATH); },
  set sqlitePath(v) { overrides.sqlitePath = resolveSqlitePath(v); },
  get strategySettingsFile() { return overrides.strategySettingsFile ?? resolvePath(process.env.STRATEGY_SETTINGS_FILE, "server/data/strategy-settings.json"); },
  set strategySettingsFile(v) { overrides.strategySettingsFile = resolvePath(v, "server/data/strategy-settings.json"); },
  get skuImageAuditPath() { return overrides.skuImageAuditPath ?? resolvePath(process.env.SKU_IMAGE_AUDIT_PATH, "server/data/sku-image-actions.jsonl"); },
  set skuImageAuditPath(v) { overrides.skuImageAuditPath = resolvePath(v, "server/data/sku-image-actions.jsonl"); },
  get salesShopifyCachePath() { return overrides.salesShopifyCachePath ?? resolvePath(process.env.SALES_SHOPIFY_CACHE_PATH, "server/data/sales-shopify-cache.json"); },
  set salesShopifyCachePath(v) { overrides.salesShopifyCachePath = resolvePath(v, "server/data/sales-shopify-cache.json"); },
  get salesShiprocketCachePath() { return overrides.salesShiprocketCachePath ?? resolvePath(process.env.SALES_SHIPROCKET_CACHE_PATH, "server/data/sales-shiprocket-cache.json"); },
  set salesShiprocketCachePath(v) { overrides.salesShiprocketCachePath = resolvePath(v, "server/data/sales-shiprocket-cache.json"); },
  get salesReconciledCachePath() { return overrides.salesReconciledCachePath ?? resolvePath(process.env.SALES_RECONCILED_CACHE_PATH, "server/data/sales-reconciled-cache.json"); },
  set salesReconciledCachePath(v) { overrides.salesReconciledCachePath = resolvePath(v, "server/data/sales-reconciled-cache.json"); },
  get sqliteBackupDir() { return overrides.sqliteBackupDir ?? resolvePath(process.env.SQLITE_BACKUP_DIR, "server/data/backups"); },
  set sqliteBackupDir(v) { overrides.sqliteBackupDir = resolvePath(v, "server/data/backups"); },
  get dataDir() { return overrides.dataDir ?? resolvePath(process.env.DATA_DIR, "server/data"); },
  set dataDir(v) { overrides.dataDir = resolvePath(v, "server/data"); },
  get tempUploadDir() { return overrides.tempUploadDir ?? resolvePath(process.env.TEMP_UPLOAD_DIR, os.tmpdir()); },
  set tempUploadDir(v) { overrides.tempUploadDir = resolvePath(v, os.tmpdir()); },
  get databaseUrl() { return overrides.databaseUrl ?? parseString(process.env.DATABASE_URL); },
  set databaseUrl(v) { overrides.databaseUrl = parseString(v); },
  get directDatabaseUrl() { return overrides.directDatabaseUrl ?? parseString(process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL); },
  set directDatabaseUrl(v) { overrides.directDatabaseUrl = parseString(v); },
  get orderMappingSchema() { return overrides.orderMappingSchema ?? parseString(process.env.ORDER_MAPPING_SCHEMA, "order_mapping"); },
  set orderMappingSchema(v) { overrides.orderMappingSchema = parseString(v); },
  get orderMappingRoute() { return "/order-mapping"; },
  get shopifyStoreDomain() { return overrides.shopifyStoreDomain ?? parseString(process.env.SHOPIFY_STORE_DOMAIN); },
  set shopifyStoreDomain(v) { overrides.shopifyStoreDomain = parseString(v); },
  get shopifyClientId() { return overrides.shopifyClientId ?? parseString(process.env.SHOPIFY_CLIENT_ID); },
  set shopifyClientId(v) { overrides.shopifyClientId = parseString(v); },
  get shopifyClientSecret() { return overrides.shopifyClientSecret ?? parseString(process.env.SHOPIFY_CLIENT_SECRET); },
  set shopifyClientSecret(v) { overrides.shopifyClientSecret = parseString(v); },
  get shopifyAdminAccessToken() { return overrides.shopifyAdminAccessToken ?? parseString(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN); },
  set shopifyAdminAccessToken(v) { overrides.shopifyAdminAccessToken = parseString(v); },
  get shopifyApiVersion() { return overrides.shopifyApiVersion ?? parseString(process.env.SHOPIFY_API_VERSION, "2026-04"); },
  set shopifyApiVersion(v) { overrides.shopifyApiVersion = parseString(v); },
  get analyticsDays() { return overrides.analyticsDays ?? parseIntVal(process.env.SHOPIFY_ANALYTICS_DAYS, 365, "SHOPIFY_ANALYTICS_DAYS"); },
  set analyticsDays(v) { overrides.analyticsDays = parseIntVal(v, 365, "SHOPIFY_ANALYTICS_DAYS"); },
  get shiprocketEmail() { return overrides.shiprocketEmail ?? parseString(process.env.SHIPROCKET_EMAIL); },
  set shiprocketEmail(v) { overrides.shiprocketEmail = parseString(v); },
  get shiprocketPassword() { return overrides.shiprocketPassword ?? parseString(process.env.SHIPROCKET_PASSWORD); },
  set shiprocketPassword(v) { overrides.shiprocketPassword = parseString(v); },
  get shiprocketToken() { return overrides.shiprocketToken ?? parseString(process.env.SHIPROCKET_TOKEN); },
  set shiprocketToken(v) { overrides.shiprocketToken = parseString(v); },
  get shiprocketBaseUrl() { return overrides.shiprocketBaseUrl ?? parseUrl(process.env.SHIPROCKET_BASE_URL, "https://apiv2.shiprocket.in", "SHIPROCKET_BASE_URL"); },
  set shiprocketBaseUrl(v) { overrides.shiprocketBaseUrl = parseUrl(v, "https://apiv2.shiprocket.in", "SHIPROCKET_BASE_URL"); },
  get shiprocketChannelId() { return overrides.shiprocketChannelId ?? parseString(process.env.SHIPROCKET_CHANNEL_ID); },
  set shiprocketChannelId(v) { overrides.shiprocketChannelId = parseString(v); },
  get shiprocketEnabled() {
    const email = this.shiprocketEmail;
    const pass = this.shiprocketPassword;
    const tok = this.shiprocketToken;
    return Boolean((email && pass) || tok || (process.env.SHIPROCKET_ENABLED && parseBool(process.env.SHIPROCKET_ENABLED)));
  },
  get adminSecret() { return overrides.adminSecret ?? parseString(process.env.ADMIN_SECRET); },
  set adminSecret(v) { overrides.adminSecret = parseString(v); },
  get apiSecret() { return overrides.apiSecret ?? parseString(process.env.API_SECRET); },
  set apiSecret(v) { overrides.apiSecret = parseString(v); },
  get metaAccessToken() { return overrides.metaAccessToken ?? parseString(process.env.META_ACCESS_TOKEN); },
  set metaAccessToken(v) { overrides.metaAccessToken = parseString(v); },
  get metaAdAccountId() { return overrides.metaAdAccountId ?? parseString(process.env.META_AD_ACCOUNT_ID); },
  set metaAdAccountId(v) { overrides.metaAdAccountId = parseString(v); },
  // Canonical Meta Graph / Marketing API version. Defined once here so version
  // strings are never scattered through services or routes.
  get metaApiVersion() { return overrides.metaApiVersion ?? parseString(process.env.META_API_VERSION, "v26.0"); },
  set metaApiVersion(v) { overrides.metaApiVersion = parseString(v, "v26.0"); },

  toSnapshot() {
    return Object.freeze({
      nodeEnv: this.nodeEnv,
      port: this.port,
      clientOrigin: this.clientOrigin,
      sqlitePath: this.sqlitePath,
      strategySettingsFile: this.strategySettingsFile,
      skuImageAuditPath: this.skuImageAuditPath,
      salesShopifyCachePath: this.salesShopifyCachePath,
      salesShiprocketCachePath: this.salesShiprocketCachePath,
      salesReconciledCachePath: this.salesReconciledCachePath,
      sqliteBackupDir: this.sqliteBackupDir,
      dataDir: this.dataDir,
      tempUploadDir: this.tempUploadDir,
      databaseUrl: this.databaseUrl,
      directDatabaseUrl: this.directDatabaseUrl,
      orderMappingSchema: this.orderMappingSchema,
      orderMappingRoute: this.orderMappingRoute,
      shopifyStoreDomain: this.shopifyStoreDomain,
      shopifyClientId: this.shopifyClientId,
      shopifyClientSecret: this.shopifyClientSecret,
      shopifyAdminAccessToken: this.shopifyAdminAccessToken,
      shopifyApiVersion: this.shopifyApiVersion,
      analyticsDays: this.analyticsDays,
      shiprocketEmail: this.shiprocketEmail,
      shiprocketPassword: this.shiprocketPassword,
      shiprocketToken: this.shiprocketToken,
      shiprocketBaseUrl: this.shiprocketBaseUrl,
      shiprocketChannelId: this.shiprocketChannelId,
      shiprocketEnabled: this.shiprocketEnabled,
      adminSecret: this.adminSecret,
      apiSecret: this.apiSecret,
      metaAccessToken: this.metaAccessToken,
      metaAdAccountId: this.metaAdAccountId,
      metaApiVersion: this.metaApiVersion,
    });
  },
};

export function getMetaCapability(customEnv = process.env) {
  const token = parseString(customEnv.META_ACCESS_TOKEN) || env.metaAccessToken;
  const accountId = parseString(customEnv.META_AD_ACCOUNT_ID) || env.metaAdAccountId;

  const missingVariables = [];
  if (!token) missingVariables.push("META_ACCESS_TOKEN");
  if (!accountId) missingVariables.push("META_AD_ACCOUNT_ID");

  return {
    available: missingVariables.length === 0,
    status: missingVariables.length === 0 ? "available" : "unavailable",
    reasonCategory: missingVariables.length === 0 ? null : "configuration_missing",
    missingVariables,
  };
}

export function ensureMetaEnv(customEnv = process.env) {
  const capability = getMetaCapability(customEnv);
  if (!capability.available) {
    throw new EnvValidationError(
      `Missing required Meta Ads environment variable(s): ${capability.missingVariables.join(", ")}`,
      capability.missingVariables,
    );
  }
}

export function getShopifyCapability(customEnv = process.env) {
  // Fall back to the env getters so runtime overrides (used by tests and
  // route middleware) are always reflected. Only variable *names* are ever
  // exposed by this helper; never values.
  const domain = parseString(customEnv.SHOPIFY_STORE_DOMAIN) || env.shopifyStoreDomain;
  const adminToken = parseString(customEnv.SHOPIFY_ADMIN_ACCESS_TOKEN) || env.shopifyAdminAccessToken;
  const clientId = parseString(customEnv.SHOPIFY_CLIENT_ID) || env.shopifyClientId;
  const clientSecret = parseString(customEnv.SHOPIFY_CLIENT_SECRET) || env.shopifyClientSecret;

  const missingVariables = [];
  if (!domain) missingVariables.push("SHOPIFY_STORE_DOMAIN");

  const hasStaticToken = Boolean(domain && adminToken);
  const hasClientCredentials = Boolean(domain && clientId && clientSecret);

  if (hasStaticToken) {
    return {
      available: true,
      status: "available",
      reasonCategory: null,
      authMode: "static_access_token",
      missingVariables: [],
    };
  }

  if (hasClientCredentials) {
    return {
      available: true,
      status: "available",
      reasonCategory: null,
      authMode: "client_credentials",
      missingVariables: [],
    };
  }

  // Unavailable: report exactly which variable names are missing for each
  // supported authentication mode so operators can fix the configuration.
  if (domain) {
    if (!adminToken) missingVariables.push("SHOPIFY_ADMIN_ACCESS_TOKEN");
    if (!clientId) missingVariables.push("SHOPIFY_CLIENT_ID");
    if (!clientSecret) missingVariables.push("SHOPIFY_CLIENT_SECRET");
  }

  return {
    available: false,
    status: "unavailable",
    reasonCategory: "configuration_missing",
    authMode: null,
    missingVariables,
  };
}

export function ensureShopifyEnv(customEnv = process.env) {
  const capability = getShopifyCapability(customEnv);
  if (!capability.available) {
    throw new EnvValidationError(
      `Missing required Shopify environment variable(s): ${capability.missingVariables.join(", ")}`,
      capability.missingVariables,
    );
  }
}

export function ensureShiprocketEnv(customEnv = process.env) {
  const hasToken = Boolean(parseString(customEnv.SHIPROCKET_TOKEN));
  const hasCreds = Boolean(parseString(customEnv.SHIPROCKET_EMAIL) && parseString(customEnv.SHIPROCKET_PASSWORD));

  if (!hasToken && !hasCreds) {
    const missing = [];
    if (!parseString(customEnv.SHIPROCKET_EMAIL)) missing.push("SHIPROCKET_EMAIL");
    if (!parseString(customEnv.SHIPROCKET_PASSWORD)) missing.push("SHIPROCKET_PASSWORD");
    throw new EnvValidationError(`Missing required Shiprocket credentials: ${missing.join(", ")}`, missing);
  }
}

export function ensurePostgresEnv(customEnv = process.env) {
  const dbUrl = parseString(customEnv.DATABASE_URL || customEnv.DIRECT_DATABASE_URL || customEnv.DATABASE_URL_UNPOOLED);
  if (!dbUrl) {
    throw new EnvValidationError("Missing required environment variable: DATABASE_URL", ["DATABASE_URL"]);
  }
}

export { envLoadReport };
