import { env } from "../config/env.js";

/**
 * Explicit check if local/test dev bypass is allowed.
 * Strictly returns false in production environments.
 */
export function isLocalDevBypassAllowed(req) {
  if (process.env.NODE_ENV === "production") {
    return false;
  }
  return true;
}

/**
 * Middleware for administrative routes (e.g. database migrations).
 * Checks X-Admin-Secret header or Bearer authorization against configured admin secret.
 * Rejects unauthorized requests with HTTP 403 Forbidden.
 */
export function requireAdminAuth(req, res, next) {
  const secret = (process.env.ADMIN_SECRET || env.shopifyClientSecret || "").trim();
  const providedHeader = req.headers["x-admin-secret"];
  const authHeader = req.headers["authorization"];
  const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim() : null;

  const providedSecret = (providedHeader || bearerToken || "").trim();

  if (secret && providedSecret === secret) {
    return next();
  }

  if (isLocalDevBypassAllowed(req) && !secret && !providedSecret) {
    return next();
  }

  return res.status(403).json({
    success: false,
    code: "FORBIDDEN",
    message: "Forbidden: Admin authorization required",
  });
}

/**
 * Middleware for route authorization boundaries.
 * Public endpoints bypass authentication.
 * Unauthorized requests in production return HTTP 401 Unauthorized.
 */
export function requireRouteAuth(req, res, next) {
  if (req.path === "/health" || req.path === "/debug/shopify" || req.path === "/delivery-resolution") {
    return next();
  }

  const authHeader = req.headers["authorization"];
  const apiToken = req.headers["x-api-token"];
  const token = (apiToken || (authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : "") || "").trim();

  const secret = (process.env.API_SECRET || "").trim();

  if (token && (secret ? token === secret : true)) {
    return next();
  }

  if (isLocalDevBypassAllowed(req)) {
    return next();
  }

  return res.status(401).json({
    success: false,
    code: "UNAUTHORIZED",
    message: "Unauthorized: Access token or valid session required",
  });
}
