import { env } from "../config/env.js";

/**
 * Canonical Shiprocket provider transport.
 *
 * Owns: base URL resolution, token lifecycle (cache + 401 refresh), request
 * execution with timeout/retry, and normalized diagnostics events.
 *
 * Domain concerns (error classes, log sinks, retry-after policy) are injected:
 *   - `onLog(entry)`   diagnostics hook; entry = {
 *                        type: "success" | "failed" | "refreshing",
 *                        operation, method, endpoint, status, statusCode,
 *                        startedAt, completedAt, durationMs, errorSummary, final
 *                      }
 *   - `createError({ status, payload, aborted })` -> Error with `.category`
 *   - `refresh()`      auth implementation for the 401 token-refresh path
 *   - `respectRetryAfter` opt-in Retry-After backoff (preserves per-domain policy)
 */

const DEFAULT_TIMEOUT_MS = 15_000;

// Module-level token cache shared by all Shiprocket domains.
let token = env.shiprocketToken;

export function isShiprocketConfigured() {
  return Boolean(token || (env.shiprocketEmail && env.shiprocketPassword));
}

export function getShiprocketBaseUrl() {
  return env.shiprocketBaseUrl.replace(/\/$/, "");
}

export function getShiprocketTimeoutMs() {
  return Number(process.env.SHIPROCKET_REQUEST_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
}

export function getCachedShiprocketToken() {
  return token;
}

export function setCachedShiprocketToken(next) {
  token = next;
}

export function clearCachedShiprocketToken() {
  token = "";
}

export function shiprocketDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pathnameOf(url) {
  return typeof url === "string" ? new URL(url).pathname : url.pathname;
}

function buildEntry(url, options, cfg, patch) {
  return {
    operation: cfg.operation,
    method: options?.method || "GET",
    endpoint: pathnameOf(url),
    startedAt: patch.startedAt,
    completedAt: patch.completedAt,
    durationMs: patch.completedAt.getTime() - patch.startedAt.getTime(),
    errorSummary: patch.errorSummary ?? null,
    ...patch,
  };
}

/**
 * Execute a Shiprocket request with shared retry/auth/timeout semantics.
 *
 * Retry policy (preserved from both legacy implementations): up to 3 attempts;
 * transient 429/5xx and network errors back off exponentially; a 401 with no
 * statically configured token triggers one refresh then a single retry.
 */
export async function shiprocketRequest(
  url,
  options = {},
  { allowRefresh = true, respectRetryAfter = false, operation = "shiprocket_api", refresh, onLog, createError } = {},
) {
  const timeoutMs = getShiprocketTimeoutMs();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = new Date();
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const payload = await response.json().catch(() => ({}));

      if (response.status === 401 && allowRefresh && !env.shiprocketToken) {
        clearCachedShiprocketToken();
        onLog?.(
          buildEntry(url, options, { operation }, {
            type: "refreshing",
            status: "refreshing",
            startedAt,
            completedAt: new Date(),
            final: true,
          }),
        );
        if (refresh) {
          await refresh();
        }
        return shiprocketRequest(url, options, {
          allowRefresh: false,
          respectRetryAfter,
          operation,
          refresh,
          onLog,
          createError,
        });
      }

      if (response.ok) {
        onLog?.(
          buildEntry(url, options, { operation }, {
            type: "success",
            status: "success",
            statusCode: response.status,
            startedAt,
            completedAt: new Date(),
            final: true,
          }),
        );
        return payload;
      }

      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && respectRetryAfter
          ? retryAfter * 1000
          : 250 * (2 ** attempt);
        await shiprocketDelay(backoff);
        continue;
      }

      const error = createError({ status: response.status, payload, aborted: false });
      onLog?.(
        buildEntry(url, options, { operation }, {
          type: "failed",
          status: "failed",
          statusCode: response.status,
          startedAt,
          completedAt: new Date(),
          errorSummary: error.message,
          final: true,
        }),
      );
      throw error;
    } catch (error) {
      const final = attempt === 2 || Boolean(error.category);
      error.category ||= error.name === "AbortError" ? "shiprocket_timeout" : "shiprocket_network";
      onLog?.(
        buildEntry(url, options, { operation }, {
          type: "failed",
          status: "failed",
          statusCode: error.statusCode || null,
          startedAt,
          completedAt: new Date(),
          errorSummary: error.message,
          final,
        }),
      );
      if (final) {
        throw error;
      }
      await shiprocketDelay(250 * (2 ** attempt));
    } finally {
      clearTimeout(timer);
    }
  }

  return {};
}

/**
 * Shiprocket auth exchange. Returns the raw login payload; the caller verifies
 * `payload.token` and persists it with setCachedShiprocketToken().
 */
export async function authenticateShiprocket({ operation = "shiprocket_auth", onLog, createError } = {}) {
  return shiprocketRequest(
    `${getShiprocketBaseUrl()}/v1/external/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: env.shiprocketEmail, password: env.shiprocketPassword }),
    },
    { allowRefresh: false, operation, onLog, createError },
  );
}
