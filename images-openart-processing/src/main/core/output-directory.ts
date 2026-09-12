import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const durableOutputError =
  'Choose a durable output directory before starting a real OpenArt generation. Temporary directories such as /tmp are not allowed.';

export function isTemporaryDirectory(directory: string): boolean {
  const resolved = path.resolve(directory);
  const temporary = path.resolve(os.tmpdir());
  const relative = path.relative(temporary, resolved);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function validateOutputDirectory(directory: string, allowTemporary = false) {
  if (!directory?.trim()) throw new Error(durableOutputError);
  const resolved = path.resolve(directory);
  if (!allowTemporary && isTemporaryDirectory(resolved)) throw new Error(durableOutputError);
  const stat = await fs.stat(resolved).catch(() => undefined);
  if (!stat?.isDirectory()) throw new Error(`Output directory does not exist: ${resolved}`);
  await fs.access(resolved, fs.constants.W_OK).catch(() => {
    throw new Error(`Output directory is not writable: ${resolved}`);
  });
  return resolved;
}
