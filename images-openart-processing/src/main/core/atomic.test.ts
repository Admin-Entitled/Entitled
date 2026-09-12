import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { atomicDownload } from './atomic.js';
describe('atomic downloads', () => {
  it('renames only after validation', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-atomic-'));
    const dest = path.join(dir, 'out.png');
    await atomicDownload(
      dest,
      async (p) => fs.writeFile(p, Buffer.from('89504e470d0a', 'hex')),
      async (p) => (await fs.readFile(p, 'hex')).startsWith('89504e'),
    );
    expect(await fs.readFile(dest, 'hex')).toBe('89504e470d0a');
  });
});
