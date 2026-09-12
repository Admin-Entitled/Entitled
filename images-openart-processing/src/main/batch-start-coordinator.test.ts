import { describe, expect, it, vi } from 'vitest';
import { BatchStartCoordinator } from './batch-start-coordinator.js';

describe('BatchStartCoordinator', () => {
  it('coalesces duplicate request IDs into exactly one engine run', async () => {
    const jobs = [{ id: 'request-12345678:SKU:01', runId: 'request-12345678' }];
    const database = { byRun: vi.fn(() => []) };
    const engine = {
      run: vi.fn(async (...args: unknown[]) => {
        const options = args[5] as { onPersisted: (value: unknown[]) => void };
        options.onPersisted(jobs);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return jobs;
      }),
    };
    const coordinator = new BatchStartCoordinator(engine as never, database as never);
    const payload = {
      requestId: 'request-12345678',
      rows: [],
      inputRoot: '/input',
      outputRoot: '/output',
      settings: {},
      preSubmitValidation: async () => undefined,
    };
    const [first, second] = await Promise.all([
      coordinator.start(payload as never),
      coordinator.start(payload as never),
    ]);
    expect(first).toEqual(second);
    expect(engine.run).toHaveBeenCalledTimes(1);
  });
});
