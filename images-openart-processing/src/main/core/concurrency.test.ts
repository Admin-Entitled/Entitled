import { describe, expect, it } from 'vitest';
import PQueue from 'p-queue';
describe('controlled concurrency', () => {
  it('does not exceed configured concurrency', async () => {
    const queue = new PQueue({ concurrency: 2 });
    let active = 0;
    let peak = 0;
    for (let i = 0; i < 8; i += 1)
      queue.add(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active -= 1;
      });
    await queue.onIdle();
    expect(peak).toBeLessThanOrEqual(2);
  });
});
