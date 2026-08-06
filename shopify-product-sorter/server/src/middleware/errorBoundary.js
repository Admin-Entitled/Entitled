import crypto from "node:crypto";
import { redactSecrets, redactNestedSecrets } from "../utils/sanitize.js";
import { logError } from "../utils/logger.js";

export class AppError extends Error {
  constructor(code, message, { statusCode = 400, details = undefined, cause = undefined } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function appError(code, message, options) {
  return new AppError(code, message, options);
}

export function errorNormalizer(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const correlationId = req.headers["x-correlation-id"] || crypto.randomUUID();

  let statusCode = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "An internal server error occurred.";
  let details = undefined;

  // Identify the type of error and normalize fields
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (err.name === "OrderMappingError" || err.constructor?.name === "OrderMappingError") {
    statusCode = err.statusCode || 400;
    code = err.code || "ORDER_MAPPING_REQUEST_FAILED";
    message = err.message || "Order Mapping request failed";
    details = err.details;
  } else if (err.name === "ValidationError" || err.statusCode === 400) {
    statusCode = 400;
    code = err.code || "VALIDATION_ERROR";
    message = err.message || "Validation failed";
    details = err.details;
  } else if (err.message === "CORS policy: Origin not allowed") {
    statusCode = 400;
    code = "CORS_NOT_ALLOWED";
    message = err.message;
  } else {
    // Log unexpected errors with correlation ID
    logError(`[Correlation ID: ${correlationId}] Unexpected server error`, err);
  }

  // Redact secrets from error message & details
  const safeMessage = redactSecrets(message);
  const safeDetails = details !== undefined ? redactNestedSecrets(details) : undefined;

  const isOrderMapping = req.baseUrl?.startsWith("/api/order-mapping") || req.path?.startsWith("/api/order-mapping");

  if (isOrderMapping) {
    return res.status(statusCode).json({
      success: false,
      code,
      message: safeMessage,
      ...(safeDetails !== undefined ? { details: safeDetails } : {}),
    });
  }

  return res.status(statusCode).json({
    error: safeMessage,
    detail: safeDetails !== undefined ? JSON.stringify(safeDetails) : safeMessage,
    success: false,
    code,
    message: safeMessage,
    correlationId,
    ...(safeDetails !== undefined ? { details: safeDetails } : {}),
  });
}
