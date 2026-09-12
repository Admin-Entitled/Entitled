import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { naturalCompare } from './natural-sort.js';
import { parseManifest } from './manifest.js';
import { composeProductPrompt, orderImageInputs, scanBatch } from './prompt-mapping.js';

describe('core mapping helpers', () => {
  it('sorts numbers naturally', () =>
    expect(['10.png', '2.png', '01.png'].sort(naturalCompare)).toEqual([
      '01.png',
      '2.png',
      '10.png',
    ]));
  it('parses quoted manifest patterns', () =>
    expect(
      parseManifest(
        'order,prompt_key,prompt_file,reference_patterns,output_name,enabled\n1,01,prompts/01.txt,"images/01_*.jpg|images/01_*.png",01.png,true',
      )[0],
    ).toMatchObject({
      promptKey: '01',
      referencePatterns: ['images/01_*.jpg', 'images/01_*.png'],
      enabled: true,
    }));
  it('rejects missing columns', () =>
    expect(() => parseManifest('order,prompt_key\n1,01')).toThrow('missing required column'));
  it('separates reusable presentation references from per-product inputs and preserves order', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-workspace-'));
    for (const directory of ['references', 'prompts', 'input/Product 1', 'input/Product 2'])
      await fs.mkdir(path.join(root, directory), { recursive: true });
    for (const file of ['front.webp', 'back.webp'])
      await fs.writeFile(path.join(root, 'references', file), 'presentation');
    for (const file of ['front.txt', 'back.txt'])
      await fs.writeFile(path.join(root, 'prompts', file), `Make ${file}`);
    for (const product of ['Product 1', 'Product 2'])
      for (const file of ['front.jpeg', 'back.jpeg'])
        await fs.writeFile(path.join(root, 'input', product, file), 'product');
    const rows = await scanBatch(root);
    expect(rows).toHaveLength(4);
    const row = rows.find((item) => item.id === 'Product 1:front')!;
    expect(row.presentationReference?.path).toContain(`${path.sep}references${path.sep}front.webp`);
    expect(row.productInputs[0].path).toContain(`${path.sep}Product 1${path.sep}front.jpeg`);
    expect(row.productInputs.some((image) => image.path.includes('references'))).toBe(false);
    expect(row.orderedInputs.map((input) => input.role)).toEqual(['presentation', 'product']);
    expect(row.completePrompt).toContain('Image 1 is a presentation reference only.');
    expect(row.completePrompt).toContain('sole source of truth for the actual garment.');
  });
  it('maps numbered filenames by role instead of numeric position', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-numbered-'));
    for (const directory of ['references', 'prompts', 'input/SKU'])
      await fs.mkdir(path.join(root, directory), { recursive: true });
    await fs.writeFile(path.join(root, 'references', '01_front.webp'), 'presentation');
    await fs.writeFile(path.join(root, 'prompts', '01_front.txt'), 'front prompt');
    await fs.writeFile(path.join(root, 'input/SKU', '01_front.jpeg'), 'product');
    const rows = await scanBatch(root);
    expect(rows[0].promptKey).toBe('front');
    expect(rows[0].status).toBe('valid');
  });
  it('blocks missing and ambiguous role mappings', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-invalid-'));
    for (const directory of ['references', 'prompts', 'input/SKU'])
      await fs.mkdir(path.join(root, directory), { recursive: true });
    await fs.writeFile(path.join(root, 'prompts', 'front.txt'), 'front prompt');
    await fs.writeFile(path.join(root, 'input/SKU', 'front.jpeg'), 'product');
    await fs.writeFile(path.join(root, 'input/SKU', '01_front.webp'), 'incorrect second product');
    const rows = await scanBatch(root);
    expect(rows[0].status).toBe('error');
    expect(rows[0].errors.join(' ')).toMatch(/presentation reference|Ambiguous product source/);
  });
  it('orders size-chart inputs as presentation, measurement, product front, then back', () => {
    const inputs = orderImageInputs(
      { name: 'layout.webp', path: '/references/layout.webp' },
      [
        { name: 'front.jpeg', path: '/input/front.jpeg' },
        { name: 'back.jpeg', path: '/input/back.jpeg' },
      ],
      { name: 'size-chart.webp', path: '/references/size-chart.webp' },
      'size-chart',
    );
    expect(inputs.map((input) => input.role)).toEqual([
      'presentation',
      'measurement',
      'product',
      'product',
    ]);
    expect(inputs.map((input) => input.image.name)).toEqual([
      'layout.webp',
      'size-chart.webp',
      'front.jpeg',
      'back.jpeg',
    ]);
  });
  it('composes the required authority prompt in the required sections', () => {
    const prompt = composeProductPrompt('Create a front ecommerce image.', 'standard');
    expect(prompt.indexOf('IMAGE ROLE DECLARATION')).toBeLessThan(
      prompt.indexOf('PRODUCT-SOURCE AUTHORITY RULES'),
    );
    expect(prompt.indexOf('PRODUCT-SOURCE AUTHORITY RULES')).toBeLessThan(
      prompt.indexOf('PRESENTATION-REFERENCE LIMITATIONS'),
    );
    expect(prompt.indexOf('PRESENTATION-REFERENCE LIMITATIONS')).toBeLessThan(
      prompt.indexOf('NUMBERED PROMPT CONTENT'),
    );
    expect(prompt).toContain(
      'Never copy the garment, colour, design, branding, fabric or construction from Image 1.',
    );
  });
  it('applies an explicit manifest to select reusable presentation, measurement, and multiple product inputs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-manifest-workspace-'));
    for (const directory of ['references', 'prompts', 'input/SKU'])
      await fs.mkdir(path.join(root, directory), { recursive: true });
    await fs.writeFile(path.join(root, 'references', 'layout.webp'), 'layout');
    await fs.writeFile(path.join(root, 'references', 'size-chart.webp'), 'measurement');
    await fs.writeFile(path.join(root, 'prompts', 'front.txt'), 'front prompt');
    for (const file of ['front.jpeg', 'back.jpeg'])
      await fs.writeFile(path.join(root, 'input/SKU', file), 'product');
    await fs.writeFile(
      path.join(root, 'manifest.csv'),
      'order,prompt_key,prompt_file,reference_patterns,output_name,enabled,presentation_reference,product_patterns,measurement_reference,output_type\n1,front,prompts/front.txt,,front.png,true,references/layout.webp,front.jpeg|back.jpeg,references/size-chart.webp,size-chart',
    );
    const [row] = await scanBatch(root);
    expect(row.status).toBe('valid');
    expect(row.outputType).toBe('size-chart');
    expect(row.orderedInputs.map((input) => input.role)).toEqual([
      'presentation',
      'measurement',
      'product',
      'product',
    ]);
    expect(row.productInputs.map((image) => image.name)).toEqual(['front.jpeg', 'back.jpeg']);
  });
  it('never accepts an input-folder file as an explicit presentation reference', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-manifest-invalid-'));
    for (const directory of ['references', 'prompts', 'input/SKU'])
      await fs.mkdir(path.join(root, directory), { recursive: true });
    await fs.writeFile(path.join(root, 'prompts', 'front.txt'), 'front prompt');
    await fs.writeFile(path.join(root, 'input/SKU', 'front.jpeg'), 'product');
    await fs.writeFile(
      path.join(root, 'manifest.csv'),
      'order,prompt_key,prompt_file,reference_patterns,output_name,enabled,presentation_reference\n1,front,prompts/front.txt,,front.png,true,input/SKU/front.jpeg',
    );
    const [row] = await scanBatch(root);
    expect(row.status).toBe('error');
    expect(row.errors.join(' ')).toContain('must come from references/');
  });
  it('keeps legacy folders blocked until a presentation reference is supplied', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-legacy-'));
    await fs.mkdir(path.join(root, 'SKU', 'images'), { recursive: true });
    await fs.mkdir(path.join(root, 'SKU', 'prompts'), { recursive: true });
    await fs.writeFile(path.join(root, 'SKU', 'images', '01_front.jpg'), 'product');
    await fs.writeFile(path.join(root, 'SKU', 'prompts', '01.txt'), 'prompt');
    const [row] = await scanBatch(root);
    expect(row.status).toBe('error');
    expect(row.completePrompt).toContain('presentation reference only');
  });
});
