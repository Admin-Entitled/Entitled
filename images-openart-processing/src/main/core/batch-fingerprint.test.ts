import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createBatchFingerprint } from './batch-fingerprint.js';
import type { BatchSettings, MappingRow, ProductSourceImage } from '../../shared/types.js';

const settings: BatchSettings = {
  model: 'gpt-image-2',
  outputs: 1,
  concurrency: 1,
  retryLimit: 0,
  overwrite: false,
  allImagesAsReferences: false,
};

describe('batch fingerprint', () => {
  it('changes when a source role changes even if the file is unchanged', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'fingerprint-'));
    const file = path.join(directory, '1-front.jpeg');
    await fs.writeFile(file, 'image fixture');
    const source = (role: ProductSourceImage['role']): ProductSourceImage => ({
      path: file,
      name: '1-front.jpeg',
      detectedRole: 'FRONT',
      role,
    });
    const row = (role: ProductSourceImage['role']): MappingRow => ({
      id: 'Product 1:01',
      product: 'Product 1',
      order: 1,
      promptKey: '01',
      references: [{ path: file, name: '1-front.jpeg' }],
      outputType: 'standard',
      productInputs: [source(role)],
      sourceImages: [source(role)],
      includedProductInputs: [source(role)],
      excludedProductInputs: [],
      orderedInputs: [
        {
          order: 1,
          role: 'product',
          label: role,
          image: source(role),
        },
      ],
      outputName: '01.png',
      enabled: true,
      status: 'valid',
      errors: [],
      completePrompt: 'prompt',
    });
    const front = await createBatchFingerprint([row('FRONT')], directory, settings);
    const detail = await createBatchFingerprint([row('DETAIL')], directory, settings);
    expect(detail).not.toBe(front);
  });
});
