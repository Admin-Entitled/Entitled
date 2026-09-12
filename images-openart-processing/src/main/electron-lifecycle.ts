export interface SafeWindow {
  isDestroyed(): boolean;
  webContents: { isDestroyed(): boolean; send(channel: string, payload: unknown): void };
}

export function safeSend(window: SafeWindow | undefined, channel: string, payload: unknown): boolean {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return false;
  window.webContents.send(channel, payload);
  return true;
}

export function onceCleanup(cleanup: () => void) {
  let complete = false;
  return () => {
    if (complete) return false;
    complete = true;
    cleanup();
    return true;
  };
}

export function createSingleWindow<T extends { isDestroyed(): boolean }>(
  current: T | undefined,
  create: () => T,
): T {
  return current && !current.isDestroyed() ? current : create();
}

export function createOnceRegistrar() {
  let registered = false;
  return (register: () => void) => {
    if (registered) return false;
    registered = true;
    register();
    return true;
  };
}
