import { describe, expect, it } from 'vitest';
import { isRetryable, retryDelay } from './retry.js';
describe('retry classification', () => {
  it('retries rate limits and server errors', () => {
    expect(isRetryable({ status: 429 })).toBe(true);
    expect(isRetryable({ status: 503 })).toBe(true);
  });
  it('does not retry auth or credit failures', () => {
    expect(isRetryable({ status: 401 })).toBe(false);
    expect(isRetryable({ status: 402 })).toBe(false);
  });
  it('retries network timeouts', () => expect(isRetryable({ code: 'ETIMEDOUT' })).toBe(true));
  it('honors retry-after and caps exponential delay', () => {
    expect(retryDelay(2, 1200)).toBe(1200);
    expect(retryDelay(20)).toBeGreaterThanOrEqual(30000);
  });
});
