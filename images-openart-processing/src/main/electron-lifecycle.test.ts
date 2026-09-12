import { expect, it, vi } from 'vitest';
import { createOnceRegistrar, createSingleWindow, onceCleanup, safeSend } from './electron-lifecycle.js';

it('creates one live main window and registers listeners once', () => {
  const create = vi.fn(() => ({ isDestroyed: () => false }));
  const existing = createSingleWindow(undefined, create);
  expect(createSingleWindow(existing, create)).toBe(existing);
  expect(create).toHaveBeenCalledTimes(1);
  const register = vi.fn();
  const registerOnce = createOnceRegistrar();
  expect(registerOnce(register)).toBe(true);
  expect(registerOnce(register)).toBe(false);
  expect(register).toHaveBeenCalledTimes(1);
});

it('sends only to a live renderer window', () => {
  const send = vi.fn();
  expect(safeSend(undefined, 'jobs:update', [])).toBe(false);
  expect(safeSend({ isDestroyed: () => true, webContents: { isDestroyed: () => false, send } }, 'jobs:update', [])).toBe(false);
  expect(safeSend({ isDestroyed: () => false, webContents: { isDestroyed: () => false, send } }, 'jobs:update', [])).toBe(true);
  expect(send).toHaveBeenCalledTimes(1);
});

it('runs shutdown cleanup exactly once', () => {
  const cleanup = vi.fn();
  const run = onceCleanup(cleanup);
  expect(run()).toBe(true);
  expect(run()).toBe(false);
  expect(cleanup).toHaveBeenCalledTimes(1);
});
