import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeReports } from './reports.js';
describe('reports', () => {
  it('writes JSON and CSV with escaped fields', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-report-'));
    await writeReports(dir, [
      {
        id: 'x',
        product: 'SKU Ü',
        promptKey: '01',
        references: ['a,b.jpg'],
        orderedInputs: [],
        outputPath: 'result.png',
        model: 'mock',
        settings: {
          model: 'mock',
          outputs: 1,
          concurrency: 2,
          retryLimit: 1,
          overwrite: false,
          allImagesAsReferences: false,
        },
        status: 'completed',
        retries: 0,
      },
    ]);
    expect(await fs.readFile(path.join(dir, 'processing-report.json'), 'utf8')).toContain('SKU Ü');
    expect(await fs.readFile(path.join(dir, 'processing-report.csv'), 'utf8')).toContain(
      '"a,b.jpg"',
    );
  });
});
