import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { ImageInputRole, OrderedImageInput, UploadedInputRecord } from '../../shared/types.js';

const persistedRole: Record<ImageInputRole, UploadedInputRecord['role']> = {
  presentation: 'presentation_reference',
  product: 'product_source',
  measurement: 'measurement_source',
};

export async function sha256File(file: string): Promise<string> {
  const digest = crypto.createHash('sha256');
  digest.update(await fs.readFile(file));
  return digest.digest('hex');
}

export async function createInputRecords(
  inputs: OrderedImageInput[],
): Promise<UploadedInputRecord[]> {
  return Promise.all(
    inputs.map(async (input) => ({
      order: input.order,
      role: persistedRole[input.role],
      localPath: input.image.path,
      sha256: await sha256File(input.image.path),
    })),
  );
}
