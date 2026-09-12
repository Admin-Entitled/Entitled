import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEntitledPreset, scanEntitledProducts } from './entitled-preset.js';
import { validateBatch } from './validate-batch.js';

describe('local batch validation', () => {
  it('validates mappings without uploading or creating jobs', async () => {
    const root = await fs.mkdtemp(path.join(process.cwd(), 'artifacts', 'validate-batch-'));
    const product = path.join(root, 'product 01');
    const out = path.join(root, 'results');
    await fs.mkdir(product, { recursive: true });
    await fs.mkdir(out);
    for (const name of ['1-front.jpeg', '2-back.jpeg', '3-detail.jpeg', '4-label.jpeg'])
      await fs.writeFile(path.join(product, name), Buffer.from('image'));
    const preset = await loadEntitledPreset(path.resolve('resources/presets/entitled-v1'));
    const scanned = await scanEntitledProducts(root, preset, [1]);
    const result = await validateBatch(
      scanned.rows,
      root,
      out,
      {
        model: 'gpt-image-2',
        outputs: 1,
        concurrency: 1,
        retryLimit: 0,
        overwrite: false,
        allImagesAsReferences: false,
      },
    );
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.inputs.map((input) => input.role)).toContain('FRONT');
    expect(result.jobs).toBe(1);
  });
});
