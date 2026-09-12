import fs from 'node:fs/promises';
import path from 'node:path';
export async function atomicDownload(
  destination: string,
  download: (temporaryPath: string) => Promise<void>,
  validate: (temporaryPath: string) => Promise<boolean>,
) {
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part-${process.pid}-${Date.now()}`;
  try {
    await download(temporary);
    if (!(await validate(temporary))) throw new Error('Downloaded result is not a valid image');
    await fs.rename(temporary, destination);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}
