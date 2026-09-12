import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanFlatFrontImages, loadEntitledPreset } from './entitled-preset.js';

describe('flat front-image batch', () => {
  it('naturally sorts independent Prompt 01 rows with isolated inputs', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'flat-front-'));
    for (const name of ['SKU-010.jpg', 'SKU-002.jpg', 'SKU-001.jpg']) await fs.writeFile(path.join(root, name), 'fake-image');
    const preset = await loadEntitledPreset(path.resolve('resources/presets/entitled-v1'));
    const result = await scanFlatFrontImages(root, preset);
    expect(result.rows.map((row) => row.product)).toEqual(['SKU-001', 'SKU-002', 'SKU-010']);
    expect(result.rows).toHaveLength(3);
    for (const row of result.rows) {
      expect(row.orderedInputs).toHaveLength(2);
      expect(row.orderedInputs[0].label).toBe('PRESENTATION REFERENCE');
      expect(row.orderedInputs[1].label).toBe('PRODUCT SOURCE');
      expect(row.orderedInputs[1].image.name).toBe(`${row.product}.jpg`);
      expect(row.outputGroup).toBe('Prompt 01');
    }
    await fs.rm(root, { recursive: true, force: true });
  });
});
