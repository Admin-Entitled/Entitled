import { redactNestedSecrets, redactSecrets } from "./sanitize.js";

export function logInfo(message, meta = {}) {
  try {
    console.log(
      JSON.stringify({
        level: "info",
        timestamp: new Date().toISOString(),
        message: redactSecrets(message),
        ...redactNestedSecrets(meta),
      }),
    );
  } catch (err) {
    console.log(
      JSON.stringify({
        level: "info",
        timestamp: new Date().toISOString(),
        message: "[Logger Error] Failed to serialize log payload",
        error: err.message,
      }),
    );
  }
}

export function logWarn(message, meta = {}) {
  try {
    console.warn(
      JSON.stringify({
        level: "warn",
        timestamp: new Date().toISOString(),
        message: redactSecrets(message),
        ...redactNestedSecrets(meta),
      }),
    );
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        timestamp: new Date().toISOString(),
        message: "[Logger Error] Failed to serialize log payload",
        error: err.message,
      }),
    );
  }
}

export function logError(message, error, meta = {}) {
  try {
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
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        timestamp: new Date().toISOString(),
        message: "[Logger Error] Failed to serialize log payload",
        error: err.message,
      }),
    );
  }
}
