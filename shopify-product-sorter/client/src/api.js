const API_BASE = "/api";

/**
 * Typed API error compatible with existing `error.message` usage.
 *
 * Carries the structured metadata returned by the backend without exposing
 * raw stacks or provider payloads:
 * - HTTP status / statusText
 * - backend error code (e.g. SHOPIFY_UNAVAILABLE, VALIDATION_ERROR)
 * - error category (e.g. configuration_missing)
 * - safe message
 * - missingVariables (names only, never values)
 * - correlationId
 * - safe details when present
 */
export class ApiError extends Error {
  constructor(message, { status, statusText, code, category, missingVariables, correlationId, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusText = statusText;
    this.code = code;
    this.category = category;
    this.missingVariables = Array.isArray(missingVariables) ? missingVariables : [];
    this.correlationId = correlationId;
    this.details = details;
  }
}

function parsePayload(response, text) {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });

  const text = await response.text().catch(() => "");
  const payload = parsePayload(response, text);

  if (!response.ok) {
    // Prefer the stable server `message` so known contract failures (e.g.
    // GENERATED_ORDER_STALE) surface their operator guidance instead of the
    // serialized counts-only `detail` payload.
    const message = payload.message || payload.detail || payload.error || response.statusText || "Request failed";
    throw new ApiError(message, {
      status: response.status,
      statusText: response.statusText,
      code: payload.code || (response.status === 503 ? "SERVICE_UNAVAILABLE" : "REQUEST_FAILED"),
      category: payload.category ?? null,
      missingVariables: payload.missingVariables || [],
      correlationId: payload.correlationId,
      details: payload.details,
    });
  }

  return payload;
}
