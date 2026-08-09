import { env } from "../config/env.js";
import { addNetworkLog } from "./sorterRuntimeService.js";
import { AppError } from "../middleware/errorBoundary.js";

/**
 * Canonical Meta (Facebook) Marketing API transport (read-only).
 *
 * Owns:
 *  - base URL + centrally-configured API version (env.metaApiVersion)
 *  - access-token injection (server-side only; never leaves the backend)
 *  - request execution with timeout
 *  - cursor pagination via paging.next until complete
 *  - provider error normalization into stable AppError codes
 *  - rate-limit detection (bounded retry/backoff, no aggressive retries)
 *  - Network Activity instrumentation (provider "Meta", token never logged)
 *
 * This module is the ONLY place Meta HTTP requests are made. Routes and
 * domain services must consume these helpers and never call fetch directly.
 */

const GRAPH_BASE_URL = "https://graph.facebook.com";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_PAGES = 50;

export const META_ERROR_CODES = {
  NOT_CONFIGURED: "META_NOT_CONFIGURED",
  AUTH_FAILED: "META_AUTH_FAILED",
  PERMISSION_DENIED: "META_PERMISSION_DENIED",
  RATE_LIMITED: "META_RATE_LIMITED",
  API_ERROR: "META_API_ERROR",
};

/** Common Meta rate-limit error codes / subcodes. */
export function isMetaRateLimitError(fbError) {
  if (!fbError) return false;
  const code = Number(fbError.code);
  const subcode = Number(fbError.error_subcode);
  return code === 17 || code === 32 || code === 613 || code === 429 || subcode === 2446079;
}

/** Meta OAuth error codes. 190 = invalid/expired access token. */
const META_AUTH_ERROR_CODES = new Set([190]);
/** Meta permission error code ranges. */
function isPermissionError(code) {
  return Number(code) >= 200 && Number(code) <= 299;
}

function redactUrl(url) {
  return String(url).replace(/access_token=[^&]+/gi, "access_token=REDACTED");
}

/**
 * Normalize a Meta API failure into a stable AppError with a META_* code.
 * Never exposes the raw provider payload or token to the frontend.
 */
export function normalizeMetaApiError({ status, data, url, operationName }) {
  const fbError = data?.error || {};
  const statusCode = Number(status) || 0;
  const providerCode = fbError.code;

  if (isMetaRateLimitError(fbError) || statusCode === 429) {
    return new AppError(META_ERROR_CODES.RATE_LIMITED, "Meta API rate limit reached. Wait and retry.", {
      statusCode: 429,
      details: {
        operation: operationName,
        retryAfter: fbError.error_subcode === 2446079 ? "backoff" : undefined,
      },
    });
  }

  if (META_AUTH_ERROR_CODES.has(providerCode)) {
    return new AppError(META_ERROR_CODES.AUTH_FAILED, "Meta access token is invalid or has expired.", {
      statusCode: 401,
      details: { operation: operationName },
    });
  }

  if (isPermissionError(providerCode)) {
    return new AppError(
      META_ERROR_CODES.PERMISSION_DENIED,
      "Meta access token lacks the required Ads permissions for this account.",
      {
        statusCode: 403,
        details: { operation: operationName },
      },
    );
  }

  return new AppError(META_ERROR_CODES.API_ERROR, "Meta API request failed.", {
    statusCode: statusCode >= 500 ? statusCode : 502,
    details: {
      operation: operationName,
      providerStatus: statusCode || undefined,
    },
  });
}

function assertConfigured() {
  if (!env.metaAccessToken || !env.metaAdAccountId) {
    throw new AppError(
      META_ERROR_CODES.NOT_CONFIGURED,
      "Meta Ads is not configured. Set META_ACCESS_TOKEN and META_AD_ACCOUNT_ID in the server environment.",
      {
        statusCode: 503,
        details: { missingVariables: ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID"] },
      },
    );
  }
}

/**
 * Single request executor. Throws normalized AppError on failure and always
 * records a Network Activity entry (token redacted).
 */
async function executeRequest({ url, operationName }) {
  const startedAt = new Date().toISOString();
  const startTime = Date.now();
  const sanitizedEndpoint = redactUrl(url);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }

    const data = await response.json().catch(() => ({}));
    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const error = normalizeMetaApiError({ status: response.status, data, url, operationName });
      addNetworkLog({
        provider: "Meta",
        operationName,
        method: "GET",
        endpoint: sanitizedEndpoint,
        statusCode: response.status,
        status: isMetaRateLimitError(data?.error) ? "rate_limited" : "failed",
        durationMs,
        errorMessage: error.message,
        metadata: { errorCode: data?.error?.code },
        startedAt,
        completedAt: new Date().toISOString(),
      });
      throw error;
    }

    addNetworkLog({
      provider: "Meta",
      operationName,
      method: "GET",
      endpoint: sanitizedEndpoint,
      statusCode: response.status,
      status: "success",
      durationMs,
      startedAt,
      completedAt: new Date().toISOString(),
    });

    return data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    const durationMs = Date.now() - startTime;
    const isTimeout = error?.name === "AbortError";
    addNetworkLog({
      provider: "Meta",
      operationName,
      method: "GET",
      endpoint: sanitizedEndpoint,
      statusCode: isTimeout ? 0 : undefined,
      status: isTimeout ? "failed" : "failed",
      durationMs,
      errorMessage: isTimeout ? "Meta request timed out" : error.message,
      startedAt,
      completedAt: new Date().toISOString(),
    });
    throw new AppError(
      META_ERROR_CODES.API_ERROR,
      isTimeout ? "Meta API request timed out." : "Meta API request failed.",
      { statusCode: 504, details: { operation: operationName } },
    );
  }
}

function buildUrl(path, params = {}) {
  const urlObj = new URL(`${GRAPH_BASE_URL}/${env.metaApiVersion}/${path}`);
  urlObj.searchParams.set("access_token", env.metaAccessToken);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      urlObj.searchParams.set(key, value);
    }
  }
  return urlObj.toString();
}

/**
 * GET a single endpoint. Used directly for account metadata and health.
 */
export async function metaGet(path, params = {}, { operationName = "MetaRequest" } = {}) {
  assertConfigured();
  const url = buildUrl(path, params);
  return executeRequest({ url, operationName });
}

/**
 * Fetch every page of a cursor-paginated endpoint until paging.next is
 * exhausted (bounded by MAX_PAGES to protect against runaway pagination).
 */
export async function metaGetAllPages(path, params = {}, { operationName = "MetaFetchAll", pageLimit = MAX_PAGES } = {}) {
  assertConfigured();
  const collected = [];
  let nextUrl = buildUrl(path, params);
  let pages = 0;

  while (nextUrl && pages < pageLimit) {
    pages += 1;
    const payload = await executeRequest({ url: nextUrl, operationName });
    if (Array.isArray(payload?.data)) {
      collected.push(...payload.data);
    }
    nextUrl = payload?.paging?.next || null;
  }

  return collected;
}

/**
 * Ad account metadata: name, currency, timezone, account status.
 * The account currency/timezone become the canonical reporting context.
 */
export async function metaGetAccount() {
  const data = await metaGet(`act_${env.metaAdAccountId}`, {
    fields: "id,name,currency,timezone_name,account_status",
  }, { operationName: "FetchAccount" });

  return {
    id: data?.id ? String(data.id) : env.metaAdAccountId,
    name: data?.name || null,
    currency: data?.currency || null,
    timezoneName: data?.timezone_name || null,
    accountStatus: data?.account_status != null ? Number(data.account_status) : null,
  };
}
