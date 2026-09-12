import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  GenerationHandle,
  GenerationRequest,
  GenerationResult,
  JobRecord,
  ModelCapability,
  OpenArtProvider,
  ProviderStatus,
  ReferenceImage,
} from '../shared/types.js';
import { JobDatabase } from './db.js';
import { BatchEngine } from './engine.js';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);
class RecordingProvider implements OpenArtProvider {
  readonly name: 'mock' | 'cli';
  generateCount = 0;
  uploadCalls: string[][] = [];
  private balance = 100;
  constructor(name: 'mock' | 'cli' = 'mock') {
    this.name = name;
  }
  async status(): Promise<ProviderStatus> {
    return { connected: true, provider: 'mock', credits: this.balance };
  }
  async models(): Promise<ModelCapability[]> {
    return [];
  }
  async uploadReferences(images: ReferenceImage[]) {
    this.uploadCalls.push(images.map((image) => image.path));
    return images.map((image) => `https://assets.test/${path.basename(image.path)}`);
  }
  async generate(_request: GenerationRequest, _assetIds: string[]): Promise<GenerationHandle> {
    this.generateCount += 1;
    this.balance -= 3;
    return { generationId: 'creation-test' };
  }
  async waitForResult(handle: GenerationHandle): Promise<GenerationResult> {
    return { generationId: handle.generationId, resultUrls: ['mock://result'] };
  }
  async downloadResult(_url: string, destination: string) {
    await fs.writeFile(destination, png);
  }
  async login() {}
}

describe('batch persistence and recovery', () => {
  it('does not persist jobs or call the provider during engine dry runs', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-engine-dry-'));
    const input = path.join(directory, 'product.jpeg');
    await fs.writeFile(input, png);
    const database = new JobDatabase(path.join(directory, 'jobs.sqlite'));
    const provider = new RecordingProvider();
    const rows = await new BatchEngine(provider, database, () => undefined).run(
      [testRow(input)],
      input,
      directory,
      {
        model: 'mock',
        outputs: 1,
        concurrency: 1,
        retryLimit: 0,
        overwrite: false,
        allImagesAsReferences: false,
      },
      true,
    );
    expect(rows[0].status).toBe('ready');
    expect(database.all()).toEqual([]);
    expect(provider.generateCount).toBe(0);
    database.close();
  });

  it('persists a local pre-submission failure without calling the provider', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-pre-submit-'));
    const input = path.join(directory, 'product.jpeg');
    await fs.writeFile(input, png);
    const database = new JobDatabase(path.join(directory, 'jobs.sqlite'));
    const provider = new RecordingProvider();
    const result = await new BatchEngine(provider, database, () => undefined).run(
      [testRow(input)],
      input,
      directory,
      {
        model: 'mock',
        outputs: 1,
        concurrency: 1,
        retryLimit: 0,
        overwrite: false,
        allImagesAsReferences: false,
      },
      false,
      {
        runId: 'run-local-failure',
        preSubmitValidation: async () => {
          throw new Error('input hash changed');
        },
      },
    );
    expect(result[0].status).toBe('failed_before_submission');
    expect(result[0].generationId).toBeUndefined();
    expect(result[0].failureStage).toBe('failed_before_submission');
    expect(provider.generateCount).toBe(0);
    database.close();
  });
  it('creates a new run instead of reusing a historical failed mapping ID', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-run-collision-'));
    const input = path.join(directory, 'product.jpeg');
    await fs.writeFile(input, png);
    const database = new JobDatabase(path.join(directory, 'jobs.sqlite'));
    const settings = {
      model: 'mock',
      outputs: 1,
      concurrency: 1,
      retryLimit: 0,
      overwrite: false,
      allImagesAsReferences: false,
    };
    database.upsert({
      id: 'SKU:01',
      product: 'SKU',
      promptKey: '01',
      references: [input],
      orderedInputs: [],
      outputPath: path.join(directory, 'SKU', '01.png'),
      model: 'mock',
      settings,
      generationId: 'historical-failed-id',
      status: 'failed',
      retries: 0,
      failureStage: 'provider_generation_failed',
    });
    const row = testRow(input);
    const provider = new RecordingProvider();
    const events: JobRecord[][] = [];
    const engine = new BatchEngine(provider, database, (jobs) => events.push(jobs));
    const result = await engine.run([row], input, directory, settings, false, {
      runId: 'run-new',
    });
    expect(provider.generateCount).toBe(1);
    expect(result[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(result[0].generationId).toBe('creation-test');
    expect(events.some((jobs) => jobs.some((job) => job.status === 'preparing'))).toBe(true);
    expect(events.some((jobs) => jobs.some((job) => job.status === 'uploading'))).toBe(true);
    expect(events.some((jobs) => jobs.some((job) => job.status === 'submitting'))).toBe(true);
    expect(events.some((jobs) => jobs.some((job) => job.status === 'processing'))).toBe(true);
    expect(events.some((jobs) => jobs.some((job) => job.status === 'downloading'))).toBe(true);
    expect(database.all().find((job) => job.id === 'SKU:01')?.generationId).toBe(
      'historical-failed-id',
    );
    database.close();
  });

  it('persists ordered uploads, balance-derived credits, and skips completed jobs', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-engine-'));
    const input = path.join(directory, 'product.jpeg');
    const presentation = path.join(directory, 'presentation.webp');
    await fs.writeFile(input, png);
    await fs.writeFile(presentation, Buffer.concat([png, Buffer.from('presentation')]));
    const database = new JobDatabase(path.join(directory, 'jobs.sqlite'));
    const provider = new RecordingProvider();
    const engine = new BatchEngine(provider, database, () => {});
    const row = {
      id: 'SKU:front',
      product: 'SKU',
      order: 1,
      promptKey: 'front',
      references: [],
      outputType: 'standard',
      productInputs: [{ path: input, name: 'product.jpeg' }],
      orderedInputs: [
        {
          order: 1,
          role: 'presentation' as const,
          label: 'PRESENTATION REFERENCE',
          image: { path: presentation, name: 'presentation.webp' },
        },
        {
          order: 2,
          role: 'product' as const,
          label: 'PRODUCT SOURCE',
          image: { path: input, name: 'product.jpeg' },
        },
      ],
      outputName: 'front.png',
      enabled: true,
      status: 'valid' as const,
      errors: [],
      completePrompt: 'prompt',
    };
    const settings = {
      model: 'mock',
      outputs: 1,
      concurrency: 1,
      retryLimit: 0,
      overwrite: false,
      allImagesAsReferences: false,
      estimatedCredits: 4,
    };
    const first = await engine.run([row], input, directory, settings, false);
    expect(first[0].status).toBe('completed');
    expect(first[0].orderedInputs.map((item) => [item.order, item.role, item.uploadedUrl])).toEqual(
      [
        [1, 'presentation_reference', 'https://assets.test/presentation.webp'],
        [2, 'product_source', 'https://assets.test/product.jpeg'],
      ],
    );
    expect(first[0].creditsUsed).toBe(3);
    expect(first[0].creditDifference).toBe(-1);
    expect(first[0].actualCreditsSource).toBe('balance-derived');
    expect(first[0].rawOutputPath).toBe(first[0].outputPath);
    await expect(fs.readFile(first[0].outputPath)).resolves.toEqual(png);
    const second = await engine.run([row], input, directory, settings, false);
    expect(second[0].status).toBe('skipped');
    expect(provider.generateCount).toBe(1);
    database.close();
  });

  it('waits on an incomplete creation after restart instead of resubmitting it', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-resume-'));
    const input = path.join(directory, 'product.jpeg');
    await fs.writeFile(input, png);
    const database = new JobDatabase(path.join(directory, 'jobs.sqlite'));
    const provider = new RecordingProvider();
    database.upsert({
      id: 'SKU:front',
      product: 'SKU',
      promptKey: 'front',
      references: [input],
      orderedInputs: [
        {
          order: 1,
          role: 'product_source',
          localPath: input,
          sha256: 'hash',
          uploadedUrl: 'https://assets.test/product.jpeg',
          uploadedAt: new Date().toISOString(),
        },
      ],
      outputPath: path.join(directory, 'SKU', 'front.png'),
      model: 'mock',
      settings: {
        model: 'mock',
        outputs: 1,
        concurrency: 1,
        retryLimit: 0,
        overwrite: false,
        allImagesAsReferences: false,
      },
      generationId: 'creation-resume',
      status: 'processing',
      retries: 0,
    });
    const row = {
      id: 'SKU:front',
      product: 'SKU',
      order: 1,
      promptKey: 'front',
      references: [],
      outputType: 'standard',
      productInputs: [{ path: input, name: 'product.jpeg' }],
      orderedInputs: [
        {
          order: 1,
          role: 'product' as const,
          label: 'PRODUCT SOURCE',
          image: { path: input, name: 'product.jpeg' },
        },
      ],
      outputName: 'front.png',
      enabled: true,
      status: 'valid' as const,
      errors: [],
      completePrompt: 'prompt',
    };
    const engine = new BatchEngine(provider, database, () => {});
    const result = await engine.run(
      [row],
      input,
      directory,
      {
        model: 'mock',
        outputs: 1,
        concurrency: 1,
        retryLimit: 0,
        overwrite: false,
        allImagesAsReferences: false,
      },
      false,
    );
    expect(result[0].status).toBe('completed');
    expect(result[0].generationId).toBe('creation-resume');
    expect(provider.generateCount).toBe(0);
    database.close();
  });

  it('interrupts pre-submission jobs on restart without resubmitting them', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-interrupted-'));
    const database = new JobDatabase(path.join(directory, 'jobs.sqlite'));
    database.upsert({
      id: 'run-stale:SKU:01',
      runId: 'run-stale',
      mappingId: 'SKU:01',
      product: 'SKU',
      promptKey: '01',
      references: [],
      orderedInputs: [],
      outputPath: path.join(directory, 'SKU', '01.png'),
      model: 'mock',
      settings: { model: 'mock', outputs: 1, concurrency: 1, retryLimit: 0, overwrite: false, allImagesAsReferences: false },
      status: 'preparing',
      retries: 0,
      attemptCount: 0,
      createdAt: '2026-09-12T13:23:06.251Z',
    });
    const engine = new BatchEngine(new RecordingProvider(), database, () => undefined);
    const resumed = await engine.resumePersisted();
    expect(resumed).toEqual([]);
    const [job] = database.byRun('run-stale');
    expect(job.status).toBe('interrupted');
    expect(job.generationId).toBeUndefined();
    expect(job.failureStage).toBe('interrupted_before_submission');
    expect(job.error).toBe('Previous application session ended before OpenArt submission.');
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('resumes persisted creation IDs after restart without renderer mappings or resubmission', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-resume-persisted-'));
    const output = path.join(directory, 'SKU', '01.png');
    const database = new JobDatabase(path.join(directory, 'jobs.sqlite'));
    database.upsert({
      id: 'run-resume:SKU:01',
      runId: 'run-resume',
      mappingId: 'SKU:01',
      product: 'SKU',
      promptKey: '01',
      references: [],
      orderedInputs: [],
      outputPath: output,
      model: 'mock',
      settings: {
        model: 'mock',
        outputs: 1,
        concurrency: 1,
        retryLimit: 0,
        overwrite: false,
        allImagesAsReferences: false,
      },
      generationId: 'creation-resume',
      status: 'processing',
      attemptCount: 1,
      retries: 0,
    });
    const provider = new RecordingProvider();
    const engine = new BatchEngine(provider, database, () => undefined);
    await engine.resumePersisted();
    const [job] = database.byRun('run-resume');
    expect(job.status).toBe('completed');
    expect(job.generationId).toBe('creation-resume');
    expect(provider.generateCount).toBe(0);
    expect(job.outputExists).toBe(true);
    database.close();
  });

  it('does not automatically resubmit an uncertain manually authorized request', async () => {
    const directory = await fs.mkdtemp(
      path.join(process.cwd(), 'artifacts', 'openart-no-resubmit-'),
    );
    const input = path.join(directory, '1-front.jpeg');
    await fs.writeFile(input, png);
    const database = new JobDatabase(path.join(directory, 'jobs.sqlite'));
    const provider = new RecordingProvider('cli');
    provider.generate = async () => {
      provider.generateCount += 1;
      throw Object.assign(new Error('timeout after submission boundary'), { status: 504 });
    };
    const row = {
      id: 'Product 1:01',
      product: 'Product 1',
      order: 1,
      promptKey: '01',
      references: [],
      outputType: 'standard',
      productInputs: [{ path: input, name: '1-front.jpeg' }],
      orderedInputs: [
        {
          order: 1,
          role: 'product' as const,
          label: 'FRONT',
          image: { path: input, name: '1-front.jpeg' },
        },
      ],
      outputName: '01.png',
      enabled: true,
      status: 'valid' as const,
      errors: [],
      completePrompt: 'prompt',
    };
    const settings = {
      model: 'gpt-image-2',
      outputs: 1,
      concurrency: 1,
      retryLimit: 0,
      overwrite: false,
      allImagesAsReferences: false,
    };
    const result = await new BatchEngine(provider, database, () => {}).run(
      [row],
      input,
      directory,
      settings,
      false,
    );
    expect(result[0].status).toBe('failed');
    expect(provider.generateCount).toBe(1);
    expect(result[0].attemptCount).toBe(1);
    expect(result[0].retries).toBe(0);
    expect(result[0].failureStage).toBe('submission_failed');
    await expect(
      new BatchEngine(provider, database, () => {}).run([row], input, directory, settings, false),
    ).rejects.toThrow('cannot be automatically resubmitted');
    expect(provider.generateCount).toBe(1);
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('does not resubmit after a provider polling failure when a creation ID exists', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'openart-poll-failure-'));
    const input = path.join(directory, 'product.jpeg');
    await fs.writeFile(input, png);
    const database = new JobDatabase(path.join(directory, 'jobs.sqlite'));
    const provider = new RecordingProvider();
    provider.waitForResult = async () => {
      throw new Error('OpenArt generation creation-test failed: upstream_error');
    };
    const row = {
      id: 'SKU:01',
      product: 'SKU',
      order: 1,
      promptKey: '01',
      references: [],
      outputType: 'standard',
      productInputs: [{ path: input, name: 'product.jpeg' }],
      orderedInputs: [
        {
          order: 1,
          role: 'product' as const,
          label: 'PRODUCT SOURCE',
          image: { path: input, name: 'product.jpeg' },
        },
      ],
      outputName: '01.png',
      enabled: true,
      status: 'valid' as const,
      errors: [],
      completePrompt: 'prompt',
    };
    const result = await new BatchEngine(provider, database, () => {}).run(
      [row],
      input,
      directory,
      {
        model: 'mock',
        outputs: 1,
        concurrency: 1,
        retryLimit: 5,
        overwrite: false,
        allImagesAsReferences: false,
      },
      false,
    );
    expect(result[0].status).toBe('failed');
    expect(result[0].generationId).toBe('creation-test');
    expect(result[0].attemptCount).toBe(1);
    expect(result[0].retries).toBe(0);
    expect(result[0].failureStage).toBe('provider_generation_failed');
    expect(provider.generateCount).toBe(1);
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  });
});

function testRow(input: string) {
  return {
    id: 'SKU:01',
    product: 'SKU',
    order: 1,
    promptKey: '01',
    references: [],
    outputType: 'standard',
    productInputs: [{ path: input, name: 'product.jpeg' }],
    orderedInputs: [
      {
        order: 1,
        role: 'product' as const,
        label: 'PRODUCT SOURCE',
        image: { path: input, name: 'product.jpeg' },
      },
    ],
    outputName: '01.png',
    enabled: true,
    status: 'valid' as const,
    errors: [],
    completePrompt: 'prompt',
  };
}
