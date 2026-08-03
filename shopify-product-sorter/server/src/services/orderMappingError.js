export class OrderMappingError extends Error {
  constructor(code, message, { statusCode = 400, details = undefined, cause = undefined } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = "OrderMappingError";
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) {
      this.details = details;
    }
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
