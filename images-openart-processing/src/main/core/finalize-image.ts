import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export interface FinalImageInfo {
  width: number;
  height: number;
  format: string;
  mode: string;
  strategy: 'square' | 'contain';
}

/** Creates the Shopify-ready derivative without changing the downloaded raw provider file. */
export async function finalizeImage(rawPath: string, finalPath: string): Promise<FinalImageInfo> {
  const metadata = await sharp(rawPath).metadata();
  if (!metadata.width || !metadata.height)
    throw new Error('Downloaded raw image has no dimensions.');
  const strategy = metadata.width === metadata.height ? 'square' : 'contain';
  await fs.mkdir(path.dirname(finalPath), { recursive: true });
  const temporary = `${finalPath}.partial-${process.pid}-${Date.now()}`;
  try {
    await sharp(rawPath)
      .ensureAlpha()
      .resize(1254, 1254, {
        fit: strategy === 'square' ? 'cover' : 'contain',
        background: { r: 237, g: 235, b: 232, alpha: 1 },
      })
      .flatten({ background: { r: 237, g: 235, b: 232 } })
      .withMetadata({ density: 72 })
      .png()
      .toFile(temporary);
    const result = await sharp(temporary).metadata();
    if (result.width !== 1254 || result.height !== 1254 || result.format !== 'png')
      throw new Error('Final image failed the 1254x1254 PNG contract.');
    await fs.rename(temporary, finalPath);
    return {
      width: result.width,
      height: result.height,
      format: result.format,
      mode: 'sRGB',
      strategy,
    };
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}
