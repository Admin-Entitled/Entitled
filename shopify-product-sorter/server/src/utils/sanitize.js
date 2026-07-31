import { env } from "../config/env.js";

const SENSITIVE_KEY_PATTERN = /^(password|secret|token|access_token|authorization|credit_card|cvv|ssn|api_key|admin_secret|shiprocket_password|shopify_client_secret)$/i;

export function redactSecrets(input) {
  if (input === null || input === undefined) {
    return input;
  }
  let text = typeof input === "string" ? input : (input instanceof Error ? input.message : String(input));

  text = text.replace(/shpat_[a-zA-Z0-9_-]+/gi, "[REDACTED_SHOPIFY_TOKEN]");
  text = text.replace(/shptka_[a-zA-Z0-9_-]+/gi, "[REDACTED_SHOPIFY_TOKEN]");
  text = text.replace(/shpca_[a-zA-Z0-9_-]+/gi, "[REDACTED_SHOPIFY_TOKEN]");
  text = text.replace(/shpua_[a-zA-Z0-9_-]+/gi, "[REDACTED_SHOPIFY_TOKEN]");
  text = text.replace(/bearer\s+[a-zA-Z0-9._~+/-]+=*/gi, "Bearer [REDACTED_TOKEN]");

  const sensitiveValues = [
    process.env.ADMIN_SECRET,
    process.env.API_SECRET,
    process.env.SHOPIFY_CLIENT_SECRET,
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    process.env.SHIPROCKET_PASSWORD,
    process.env.SHIPROCKET_TOKEN,
    env?.shopifyClientSecret,
    env?.shopifyAdminAccessToken,
    env?.shiprocketPassword,
    env?.shiprocketToken,
  ].filter((v) => typeof v === "string" && v.trim().length > 3);

  for (const secret of sensitiveValues) {
    if (secret) {
      text = text.replaceAll(secret, "[REDACTED]");
    }
  }

  return text;
}

export function redactNestedSecrets(data) {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === "string") {
    return redactSecrets(data);
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => redactNestedSecrets(item));
  }

  if (data instanceof Error) {
    const copy = new Error(redactSecrets(data.message));
    if (data.stack) {
      copy.stack = redactSecrets(data.stack);
    }
    return copy;
  }

  const result = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactNestedSecrets(value);
    }
  }
  return result;
}
