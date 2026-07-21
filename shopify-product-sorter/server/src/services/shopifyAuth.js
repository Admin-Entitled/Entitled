import { env, ensureShopifyEnv } from "../config/env.js";
import { logError, logInfo } from "../utils/logger.js";

const EXPIRY_SKEW_MS = 60_000;

let cachedAccessToken = null;
let cachedExpiresAt = 0;
let inFlightTokenRequest = null;
let lastAuthError = null;

function getCleanStoreDomain() {
  let domain = env.shopifyStoreDomain || "";
  domain = domain.replace(/^https?:\/\//, ""); // Remove protocol if present
  domain = domain.replace(/\/+$/, "");        // Remove trailing slashes
  return domain;
}

export function getShopifyGraphQLEndpoint() {
  const domain = getCleanStoreDomain();
  return `https://${domain}/admin/api/${env.shopifyApiVersion || "2026-04"}/graphql.json`;
}

function isTokenFresh() {
  if (!cachedAccessToken) {
    return false;
  }
  const timeRemaining = cachedExpiresAt - Date.now();
  const isFresh = timeRemaining > EXPIRY_SKEW_MS;
  return isFresh;
}

async function requestClientCredentialsToken() {
  ensureShopifyEnv();
  const domain = getCleanStoreDomain();
  const endpoint = `https://${domain}/admin/oauth/access_token`;

  logInfo("Requesting Shopify access token from OAuth endpoint", {
    endpoint,
    clientId: env.shopifyClientId,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: env.shopifyClientId,
        client_secret: env.shopifyClientSecret,
      }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const message = payload?.error_description || payload?.error || `HTTP ${response.status}`;
      const error = new Error(message);
      logError("Shopify token request failed", error, {
        endpoint,
        httpStatus: response.status,
        payload,
      });
      lastAuthError = error;
      throw error;
    }

    if (!payload?.access_token) {
      const error = new Error("Shopify token response did not include an access_token");
      logError("Shopify token request failed", error, {
        endpoint,
        payload,
      });
      lastAuthError = error;
      throw error;
    }

    const expiresInSeconds = Number(payload.expires_in || 0);
    // Shopify tokens usually expire in 24 hours (86400 seconds)
    const tokenDuration = expiresInSeconds ? expiresInSeconds * 1000 : 24 * 60 * 60 * 1000;
    const expiresAt = Date.now() + tokenDuration;

    cachedAccessToken = payload.access_token;
    cachedExpiresAt = expiresAt;
    lastAuthError = null;

    logInfo("Shopify token request succeeded", {
      expiresInSeconds,
      expiresAt: new Date(expiresAt).toISOString(),
    });

    return cachedAccessToken;
  } catch (error) {
    lastAuthError = error;
    throw error;
  }
}

export async function getAccessToken() {
  if (env.shopifyAdminAccessToken) return env.shopifyAdminAccessToken;
  if (isTokenFresh()) {
    logInfo("Using cached fresh Shopify access token", {
      expiresAt: new Date(cachedExpiresAt).toISOString(),
      timeRemainingMs: cachedExpiresAt - Date.now(),
    });
    return cachedAccessToken;
  }

  if (cachedAccessToken) {
    logInfo("Shopify access token expired or near expiry, initiating renewal", {
      expiresAt: new Date(cachedExpiresAt).toISOString(),
      timeRemainingMs: cachedExpiresAt - Date.now(),
    });
  }

  if (!inFlightTokenRequest) {
    inFlightTokenRequest = requestClientCredentialsToken().finally(() => {
      inFlightTokenRequest = null;
    });
  }

  return inFlightTokenRequest;
}

export async function getShopifyAuthHeaders() {
  const accessToken = await getAccessToken();
  return {
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
  };
}

export async function primeShopifyAuthCache() {
  if (!env.shopifyStoreDomain || !env.shopifyClientId || !env.shopifyClientSecret) {
    logInfo("Skipping Shopify auth cache priming due to incomplete credentials.");
    return;
  }

  try {
    logInfo("Priming Shopify auth cache");
    await getAccessToken();
  } catch (error) {
    logError("Failed to prime Shopify auth cache", error);
  }
}

export function getCachedTokenStatus() {
  return {
    hasToken: Boolean(cachedAccessToken),
    expiresAt: cachedExpiresAt ? new Date(cachedExpiresAt).toISOString() : null,
    expiresInMs: cachedExpiresAt ? cachedExpiresAt - Date.now() : 0,
    isFresh: isTokenFresh(),
    lastAuthError: lastAuthError ? lastAuthError.message : null,
  };
}
