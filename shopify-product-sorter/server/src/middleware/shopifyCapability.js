import crypto from "node:crypto";
import { getShopifyCapability } from "../config/env.js";

/**
 * Shared Shopify capability contract.
 *
 * Any Shopify-dependent route must use `shopifyCapabilityGuard` so that an
 * unconfigured environment returns a stable HTTP 503 SHOPIFY_UNAVAILABLE
 * response instead of surfacing an unexpected 500. This middleware performs
 * no live Shopify request and never exposes secret values.
 */
export function shopifyUnavailablePayload(capability, req) {
  const correlationId = req?.headers?.["x-correlation-id"] || crypto.randomUUID();
  return {
    success: false,
    code: "SHOPIFY_UNAVAILABLE",
    message: "Shopify is not configured for this environment.",
    category: capability?.reasonCategory || "configuration_missing",
    missingVariables: capability?.missingVariables || [],
    correlationId,
  };
}

export function shopifyCapabilityGuard(req, res, next) {
  const capability = getShopifyCapability();
  if (!capability.available) {
    return res.status(503).json(shopifyUnavailablePayload(capability, req));
  }
  return next();
}
