export function logInfo(message, meta = {}) {
  console.log(
    JSON.stringify({
      level: "info",
      timestamp: new Date().toISOString(),
      message,
      ...meta,
    }),
  );
}

export function logWarn(message, meta = {}) {
  console.warn(
    JSON.stringify({
      level: "warn",
      timestamp: new Date().toISOString(),
      message,
      ...meta,
    }),
  );
}

export function logError(message, error, meta = {}) {
  console.error(
    JSON.stringify({
      level: "error",
      timestamp: new Date().toISOString(),
      message,
      error: error instanceof Error ? error.message : error,
      ...meta,
    }),
  );
}
