import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { JobDatabase } from './db.js';

describe('job database migration and rehydration', () => {
  it('migrates legacy jobs without deleting history', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-db-'));
    const file = path.join(directory, 'jobs.sqlite');
    const legacy = new Database(file);
    legacy.exec(
      `CREATE TABLE jobs (id TEXT PRIMARY KEY, product TEXT NOT NULL, prompt_key TEXT NOT NULL, prompt_file TEXT, references_json TEXT NOT NULL, output_path TEXT NOT NULL, model TEXT NOT NULL, settings_json TEXT NOT NULL, generation_id TEXT, status TEXT NOT NULL, retries INTEGER NOT NULL DEFAULT 0, error TEXT, started_at TEXT, ended_at TEXT, credits_used REAL)`,
    );
    legacy
      .prepare('INSERT INTO jobs VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(
        'legacy',
        'SKU',
        'front',
        null,
        '[]',
        path.join(directory, 'gone.png'),
        'mock',
        '{}',
        null,
        'completed',
        0,
        null,
        null,
        null,
        null,
      );
    legacy.close();
    const database = new JobDatabase(file);
    const jobs = database.all();
    expect(database.schemaVersion).toBe(10);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].id).toBe('legacy');
    expect(jobs[0].attemptCount).toBe(0);
    expect(jobs[0].retries).toBe(0);
    expect(jobs[0].orderedInputs).toEqual([]);
    expect(jobs[0].outputExists).toBe(false);
    database.close();
  });

  it('persists run identity, live timestamps, provider errors, and dashboard visibility', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-db-run-'));
    const database = new JobDatabase(path.join(directory, 'jobs.sqlite'));
    database.upsert({
      id: 'run-1:product:01',
      runId: 'run-1',
      mappingId: 'product:01',
      product: 'Product',
      promptKey: '01',
      references: [],
      orderedInputs: [],
      outputPath: path.join(directory, '01.png'),
      model: 'gpt-image-2',
      settings: {
        model: 'gpt-image-2',
        outputs: 1,
        concurrency: 1,
        retryLimit: 0,
        overwrite: false,
        allImagesAsReferences: false,
      },
      status: 'submitted',
      retries: 0,
      createdAt: '2026-09-12T16:30:00.000Z',
      submittedAt: '2026-09-12T16:30:01.000Z',
      lastStatusAt: '2026-09-12T16:30:02.000Z',
      providerErrorCode: 'upstream_error',
      providerErrorMessage: 'Invalid prompt',
      hidden: false,
    });
    let [job] = database.all();
    expect(job).toMatchObject({
      runId: 'run-1',
      mappingId: 'product:01',
      status: 'submitted',
      providerErrorCode: 'upstream_error',
      providerErrorMessage: 'Invalid prompt',
      hidden: false,
    });
    database.hide(job.id);
    [job] = database.all();
    expect(job.hidden).toBe(true);
    database.close();
  });

  it('rehydrates resolved source roles and sanitized dry-run diagnostics', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-db-role-'));
    const database = new JobDatabase(path.join(directory, 'jobs.sqlite'));
    database.upsert({
      id: 'product:01',
      product: 'Product 1',
      promptKey: '01',
      references: ['/product/1-front.jpeg'],
      orderedInputs: [],
      sourceMappings: [
        {
          path: '/product/1-front.jpeg',
          name: '1-front.jpeg',
          detectedRole: 'FRONT',
          role: 'FRONT',
        },
      ],
      outputPath: path.join(directory, '01.png'),
      model: 'gpt-image-2',
      settings: {
        model: 'gpt-image-2',
        outputs: 1,
        concurrency: 1,
        retryLimit: 0,
        overwrite: false,
        allImagesAsReferences: false,
      },
      status: 'queued',
      retries: 0,
      dryRunDiagnostics: {
        exitCode: 0,
        parsedJson: { data: { pricing: { estimated_credits: 41 } } },
        stdout: '{}',
        stderr: '',
        cliVersion: 'openart 1.0.0',
        args: ['generate', 'image'],
        estimateAvailable: true,
        estimateSource: '$.data.pricing.estimated_credits',
      },
    });
    const [job] = database.all();
    expect(job.sourceMappings?.[0]).toMatchObject({ role: 'FRONT' });
    expect(job.dryRunDiagnostics?.estimateSource).toBe('$.data.pricing.estimated_credits');
    database.close();
  });
});
