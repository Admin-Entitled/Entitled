import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { resolvePreviewPath } from './preview-path.js';

describe('secure preview paths', () => {
  it('allows regular files inside registered roots only', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-root-'));
    const image = path.join(root, 'image.png');
    await fs.writeFile(image, 'fixture');
    expect((await resolvePreviewPath(image, [root])).path).toBe(image);
    expect(
      await resolvePreviewPath(path.join(root, '..', path.basename(root), 'image.png'), [root]),
    ).toEqual({ path: image });
    expect(
      (await resolvePreviewPath(path.join(root, '..', 'outside.png'), [root])).path,
    ).toBeUndefined();
  });

  it('rejects directories and relative paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-root-'));
    expect((await resolvePreviewPath(root, [root])).path).toBeUndefined();
    expect((await resolvePreviewPath('image.png', [root])).path).toBeUndefined();
  });

  it('rejects symlinks that escape a registered root', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-root-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'preview-outside-'));
    const target = path.join(outside, 'secret.png');
    await fs.writeFile(target, 'secret');
    await fs.symlink(target, path.join(root, 'linked.png'));
    expect((await resolvePreviewPath(path.join(root, 'linked.png'), [root])).path).toBeUndefined();
  });
});
