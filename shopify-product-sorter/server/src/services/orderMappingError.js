import { AppError } from "../middleware/errorBoundary.js";

export class OrderMappingError extends AppError {
  constructor(code, message, { statusCode = 400, details = undefined, cause = undefined } = {}) {
    super(code, message, { statusCode, details, cause });
    this.name = "OrderMappingError";
  }
}

export function orderMappingError(code, message, options) {
  return new OrderMappingError(code, message, options);
}

export function normalizeOrderMappingError(error) {
  if (error instanceof OrderMappingError) {
    return error;
  }

  return new OrderMappingError(
    "ORDER_MAPPING_REQUEST_FAILED",
    "Order Mapping request failed",
    { statusCode: 500, cause: error },
  );
}
