import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanBatch } from '../src/main/core/prompt-mapping.js';
import { JobDatabase } from '../src/main/db.js';
import { BatchEngine } from '../src/main/engine.js';
import { MockOpenArtProvider } from '../src/main/providers/mock.js';
const root = path.resolve('sample-data/reusable-workspace');
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'images-openart-output-'));
const rows = await scanBatch(root);
const db = new JobDatabase(path.join(output, 'jobs.sqlite'));
const engine = new BatchEngine(new MockOpenArtProvider(), db, () => {});
const jobs = await engine.run(
  rows,
  root,
  output,
  {
    model: 'mock-model',
    outputs: 1,
    concurrency: 2,
    retryLimit: 2,
    overwrite: false,
    allImagesAsReferences: false,
  },
  true,
);
console.log(
  JSON.stringify(
    { output, rows: rows.length, jobs: jobs.length, status: jobs.map((job) => job.status) },
    null,
    2,
  ),
);
db.close();
