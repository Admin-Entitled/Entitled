import { describe, expect, it, vi } from 'vitest';
import { createGenerationSubmissionController } from './submission-controller.js';

describe('generation submission controller', () => {
  it('opens and cancels confirmation without submitting', async () => {
    const submit = vi.fn(async () => undefined);
    const controller = createGenerationSubmissionController(submit);
    controller.open();
    expect(controller.state()).toBe('confirmation_open');
    expect(submit).not.toHaveBeenCalled();
    controller.cancel();
    expect(controller.state()).toBe('ready');
    expect(submit).not.toHaveBeenCalled();
  });

  it('sets submitting synchronously and permits exactly one confirmation call', async () => {
    let release!: () => void;
    const submit = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const states: string[] = [];
    const controller = createGenerationSubmissionController(submit, (state) => states.push(state));
    controller.open();
    const first = controller.confirm();
    const second = controller.confirm();
    expect(controller.state()).toBe('submitting');
    expect(states).toContain('submitting');
    expect(submit).toHaveBeenCalledTimes(1);
    release();
    await Promise.all([first, second]);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
