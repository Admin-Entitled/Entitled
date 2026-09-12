import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolveOpenArtCliExecutable } from './openart-cli-resolver.js';

describe('resolveOpenArtCliExecutable', () => {
  it('resolves absolute, symlink and persisted paths and rejects unsafe paths', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-resolver-'));
    const real = path.join(dir, 'openart-real');
    const link = path.join(dir, 'openart-link');
    await fs.writeFile(real, '#!/bin/sh\nprintf "openart test\\n"\n', { mode: 0o755 });
    await fs.symlink(real, link);
    const result = await resolveOpenArtCliExecutable({ explicitPath: link, probe: async () => 'openart test' });
    expect(result.path).toBe(real);
    await expect(resolveOpenArtCliExecutable({ explicitPath: dir, knownPaths: [], envPath: '', probe: async () => 'openart test' })).rejects.toThrow();
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('uses persisted path when PATH is empty', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-resolver-'));
    const real = path.join(dir, 'openart');
    await fs.writeFile(real, '#!/bin/sh\nprintf "openart test\\n"\n', { mode: 0o755 });
    const result = await resolveOpenArtCliExecutable({ persistedPath: real, knownPaths: [], envPath: '', probe: async () => 'openart test' });
    expect(result.path).toBe(real);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
