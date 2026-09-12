import { describe, expect, it } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { isTemporaryDirectory, validateOutputDirectory } from './output-directory.js';

describe('durable output directories', () => {
  it('rejects empty and temporary real output directories', async () => {
    await expect(validateOutputDirectory('', false)).rejects.toThrow('durable output');
    await expect(validateOutputDirectory(os.tmpdir(), false)).rejects.toThrow('durable output');
    expect(isTemporaryDirectory(path.join(os.tmpdir(), 'nested'))).toBe(true);
  });

  it('accepts a writable persistent directory', async () => {
    const directory = process.cwd();
    await expect(validateOutputDirectory(directory, false)).resolves.toBe(path.resolve(directory));
  });
});
