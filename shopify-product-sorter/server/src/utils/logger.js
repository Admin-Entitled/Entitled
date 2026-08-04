import { redactNestedSecrets, redactSecrets } from "./sanitize.js";

export function logInfo(message, meta = {}) {
  console.log(
    JSON.stringify({
      level: "info",
      timestamp: new Date().toISOString(),
      message: redactSecrets(message),
      ...redactNestedSecrets(meta),
    }),
  );
}

export function logWarn(message, meta = {}) {
  console.warn(
    JSON.stringify({
      level: "warn",
      timestamp: new Date().toISOString(),
      message: redactSecrets(message),
      ...redactNestedSecrets(meta),
    }),
  );
}

export function logError(message, error, meta = {}) {
  const sanitizedError = error instanceof Error
    ? redactSecrets(error.message)
    : redactSecrets(String(error));

  console.error(
    JSON.stringify({
      level: "error",
      timestamp: new Date().toISOString(),
      message: redactSecrets(message),
      error: sanitizedError,
      ...redactNestedSecrets(meta),
    }),
  );
}
