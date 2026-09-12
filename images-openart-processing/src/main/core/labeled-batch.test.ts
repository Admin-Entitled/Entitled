import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadEntitledPreset, scanLabeledBatchFolder } from './entitled-preset.js';

describe('labeled multi-SKU batch', () => {
  it('groups files by SKU, preserves roles and selects conditional sleeve rules', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'labeled-batch-'));
    const names = [
      'BOSS-002__FRONT__LONG_SLEEVE.jpg', 'BOSS-002__DETAIL.jpeg', 'BOSS-002__LABEL.jpeg', 'BOSS-002__BACK.jpeg',
      'AX-001__FRONT__SHORT_SLEEVE.jpg', 'AX-001__DETAIL-02.jpeg', 'AX-001__DETAIL-01.jpeg', 'AX-001__LABEL_BRANDING.jpeg',
    ];
    for (const name of names) await fs.writeFile(path.join(root, name), 'fixture');
    const preset = await loadEntitledPreset(path.resolve('resources/presets/entitled-v1'));
    const result = await scanLabeledBatchFolder(root, preset);
    expect(result.rows.map((row) => row.product)).toEqual(['AX-001', 'BOSS-002']);
    expect(result.rows[0].orderedInputs.slice(1).map((item) => item.image.name)).toEqual(['AX-001__FRONT__SHORT_SLEEVE.jpg', 'AX-001__DETAIL-01.jpeg', 'AX-001__DETAIL-02.jpeg', 'AX-001__LABEL_BRANDING.jpeg']);
    expect(result.rows[0].excludedProductInputs?.map((item) => item.name)).toEqual([]);
    expect(result.rows[1].excludedProductInputs?.[0].name).toBe('BOSS-002__BACK.jpeg');
    expect(result.rows[0].completePrompt).toContain('Product-source images are the sole authority');
    expect(result.rows[1].completePrompt).toContain('This is a full-length long-sleeve product');
    expect(result.rows[1].completePrompt).not.toMatch(/SHORT-SLEEVE GEOMETRY LOCK|PRIMARY SLEEVE FOLD/i);
    await fs.rm(root, { recursive: true, force: true });
  });
});
