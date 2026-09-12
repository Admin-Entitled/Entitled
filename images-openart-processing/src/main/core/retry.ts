export function isRetryable(error: unknown) {
  const value = error as { status?: number; code?: string; name?: string };
  if ([401, 403, 402, 422].includes(value.status ?? 0)) return false;
  if ([429, 500, 502, 503, 504].includes(value.status ?? 0)) return true;
  return ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'TimeoutError', 'AbortError'].includes(
    value.code ?? value.name ?? '',
  );
}
export function retryDelay(attempt: number, retryAfterMs?: number) {
  if (retryAfterMs !== undefined) return Math.max(0, retryAfterMs);
  return Math.min(30_000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}
