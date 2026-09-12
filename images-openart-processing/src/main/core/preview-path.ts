import fs from 'node:fs/promises';
import path from 'node:path';

export async function resolvePreviewPath(file: string, roots: Iterable<string>) {
  if (!file || !path.isAbsolute(file))
    return { error: 'Preview path must be an absolute filesystem path.' };
  const resolved = path.resolve(file);
  try {
    const realFile = await fs.realpath(resolved);
    const realRoots = await Promise.all([...roots].map((root) => fs.realpath(path.resolve(root))));
    const insideRoot = realRoots.some((root) => {
      const relative = path.relative(root, realFile);
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    });
    if (!insideRoot) return { error: 'Preview path is outside the registered application roots.' };
    const stat = await fs.stat(realFile);
    if (!stat.isFile()) return { error: 'Preview path is not a regular file.' };
    await fs.access(realFile, fs.constants.R_OK);
    return { path: realFile };
  } catch (error) {
    return {
      error: `Preview file could not be read: ${error instanceof Error ? error.message : 'unknown filesystem error'}`,
    };
  }
}
