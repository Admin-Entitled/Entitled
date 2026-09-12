import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadEntitledPreset, scanEntitledProducts } from './entitled-preset.js';

const png = (width: number, height: number) => {
  const value = Buffer.alloc(24);
  Buffer.from('\x89PNG\r\n\x1a\n', 'binary').copy(value);
  value.writeUInt32BE(width, 16);
  value.writeUInt32BE(height, 20);
  return value;
};

describe('ENTITLED Catalogue v1 preset', () => {
  it('loads canonical prompts, masters, and hardcoded reference mapping', async () => {
    const preset = await loadEntitledPreset(path.resolve('resources/presets/entitled-v1'));
    expect(preset.name).toBe('ENTITLED Catalogue v1');
    expect(preset.prompts).toHaveLength(10);
    expect(preset.prompts.find((prompt) => prompt.number === 1)?.referencePath).toContain(
      '01-isolated-front.png',
    );
    expect(preset.prompts.find((prompt) => prompt.number === 3)?.referencePath).toContain(
      '03-collar-detail.png',
    );
    expect(preset.masterRulesReady).toBe(true);
    expect(preset.prompts.slice(0, 9).every((prompt) => prompt.canonicalFound)).toBe(true);
    expect(preset.prompts.slice(0, 9).every((prompt) => prompt.ready)).toBe(true);
    expect(preset.prompts.find((prompt) => prompt.number === 1)?.canonicalSha256).toBe(
      'b17b1cfbb689609364bd950133579a6a1db0b4d72a2a956d75fb5b21fe8ab7f4',
    );
    expect(preset.prompts.find((prompt) => prompt.number === 10)?.ready).toBe(false);
    expect(preset.prompts.find((prompt) => prompt.number === 10)?.missingReason).toContain(
      'approved Prompt 01 output',
    );
  });

  it('scans multiple products and naturally orders all product photographs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'entitled-products-'));
    for (const product of ['Product 2', 'Product 1']) {
      await fs.mkdir(path.join(root, product));
      for (const name of ['10-fabric.jpg', '2-detail.jpg', '1-front.jpg'])
        await fs.writeFile(path.join(root, product, name), png(20, 20));
    }
    const preset = await loadEntitledPreset(path.resolve('resources/presets/entitled-v1'));
    const result = await scanEntitledProducts(root, preset, [1]);
    expect(result.summaries.map((summary) => summary.product)).toEqual(['Product 1', 'Product 2']);
    expect(result.rows[0].orderedInputs.map((input) => input.role)).toEqual([
      'presentation',
      'product',
      'product',
      'product',
    ]);
    expect(result.rows[0].productInputs.map((image) => image.name)).toEqual([
      '1-front.jpg',
      '2-detail.jpg',
      '10-fabric.jpg',
    ]);
    expect(result.rows.every((row) => row.enabled)).toBe(true);
    expect(
      result.rows.every((row) => row.completePrompt?.includes('PRODUCT-SOURCE AUTHORITY')),
    ).toBe(true);
    expect(
      result.rows.every((row) => row.completePrompt?.includes('BACKGROUND — ABSOLUTE COLOUR LOCK')),
    ).toBe(true);
  });

  it('uses canonical prompt and master files only when all are present', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'entitled-canonical-'));
    await fs.mkdir(path.join(root, 'canonical-prompts'), { recursive: true });
    await fs.mkdir(path.join(root, 'masters'), { recursive: true });
    await fs.mkdir(path.join(root, 'references'), { recursive: true });
    await fs.writeFile(path.join(root, 'masters/ENTITLED_IMAGE_RULES.md'), 'image rules');
    await fs.writeFile(path.join(root, 'masters/ENTITLED_VISUAL_SYSTEM.md'), 'visual system');
    await fs.writeFile(path.join(root, 'canonical-prompts/01.txt'), 'canonical numbered prompt');
    await fs.writeFile(path.join(root, 'references/01-isolated-front.png'), png(20, 20));
    await fs.writeFile(
      path.join(root, 'preset.json'),
      JSON.stringify({
        id: 'test',
        name: 'Test',
        masters: {
          imageRules: 'masters/ENTITLED_IMAGE_RULES.md',
          visualSystem: 'masters/ENTITLED_VISUAL_SYSTEM.md',
        },
        prompts: [
          {
            number: 1,
            name: 'One',
            file: 'prompts/01.txt',
            canonicalFile: 'canonical-prompts/01.txt',
            reference: 'references/01-isolated-front.png',
          },
        ],
      }),
    );
    const preset = await loadEntitledPreset(root);
    expect(preset.prompts[0].canonicalFound).toBe(true);
    expect(preset.prompts[0].canonicalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(preset.masterRulesReady).toBe(true);
    const productRoot = path.join(root, 'products');
    await fs.mkdir(path.join(productRoot, 'SKU'), { recursive: true });
    await fs.writeFile(path.join(productRoot, 'SKU/1-front.jpg'), png(20, 20));
    const result = await scanEntitledProducts(productRoot, preset, [1]);
    expect(result.rows[0].enabled).toBe(true);
    expect(result.rows[0].completePrompt).not.toContain('image rules');
    expect(result.rows[0].completePrompt).not.toContain('visual system');
    expect(result.rows[0].completePrompt).toContain('canonical numbered prompt');
  });
});
