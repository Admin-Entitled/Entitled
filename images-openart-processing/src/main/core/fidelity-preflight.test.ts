import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createFidelityPreflight } from './fidelity-preflight.js';

const png = (width: number, height: number) => {
  const value = Buffer.alloc(24);
  Buffer.from('\x89PNG\r\n\x1a\n', 'binary').copy(value);
  value.writeUInt32BE(width, 16);
  value.writeUInt32BE(height, 20);
  return value;
};

describe('raw garment fidelity preflight', () => {
  it('reports real-file metadata and preserves presentation-first ordering', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-fidelity-'));
    const presentation = path.join(root, 'presentation.webp');
    const product10 = path.join(root, '10_front.jpeg');
    const product2 = path.join(root, '02_back.jpeg');
    const prompt = path.join(root, '01.txt');
    await fs.writeFile(presentation, png(1200, 900));
    await fs.writeFile(product10, png(800, 800));
    await fs.writeFile(product2, png(700, 700));
    await fs.writeFile(prompt, 'Create the front ecommerce garment presentation.');
    const { report, row } = await createFidelityPreflight({
      presentationPath: presentation,
      productPaths: [product10, product2],
      promptPath: prompt,
      outputRoot: process.cwd(),
      model: 'gpt-image-2',
      supportedSettings: { imageCount: 1 },
      estimatedCredits: 42,
    });
    expect(report.label).toContain('RAW GARMENT FIDELITY TEST');
    expect(report.enabledJobCount).toBe(1);
    expect(report.presentationReference.width).toBe(1200);
    expect(report.productSources.map((asset) => asset.name)).toEqual([
      '02_back.jpeg',
      '10_front.jpeg',
    ]);
    expect(report.orderedProviderInputs.map((input) => input.role)).toEqual([
      'presentation_reference',
      'product_source',
      'product_source',
    ]);
    expect(row.enabled).toBe(true);
    expect(row.orderedInputs.map((input) => input.order)).toEqual([1, 2, 3]);
    expect(report.completePrompt).toContain('exact #EDEBE8 background');
    expect(report.completePrompt).toContain('exactly one image, never a collage');
  });

  it('blocks temporary output and non-Prompt-01 files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-fidelity-invalid-'));
    const image = path.join(root, 'real.webp');
    const product = path.join(root, 'product.jpeg');
    const prompt = path.join(root, '02.txt');
    await fs.writeFile(image, png(10, 10));
    await fs.writeFile(product, png(10, 10));
    await fs.writeFile(prompt, 'prompt');
    await expect(
      createFidelityPreflight({
        presentationPath: image,
        productPaths: [product],
        promptPath: prompt,
        outputRoot: process.cwd(),
        model: 'gpt-image-2',
        supportedSettings: {},
      }),
    ).rejects.toThrow('Prompt 01');
    await expect(
      createFidelityPreflight({
        presentationPath: image,
        productPaths: [path.join(root, 'missing.webp')],
        promptPath: path.join(root, '01.txt'),
        outputRoot: os.tmpdir(),
        model: 'gpt-image-2',
        supportedSettings: {},
      }),
    ).rejects.toThrow('durable output');
  });
});
