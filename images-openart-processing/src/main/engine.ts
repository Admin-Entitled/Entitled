import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import PQueue from 'p-queue';
import type {
  BatchSettings,
  JobFailureStage,
  JobRecord,
  MappingRow,
  OpenArtProvider,
} from '../shared/types.js';
import { versionOutputPath } from './core/paths.js';
import { atomicDownload } from './core/atomic.js';
import { isRetryable, retryDelay } from './core/retry.js';
import { writeReports } from './core/reports.js';
import { createInputRecords } from './core/input-records.js';
import { validateOutputDirectory } from './core/output-directory.js';
import { JobDatabase } from './db.js';
export class BatchEngine {
  private queue?: PQueue;
  private paused = false;
  private cancelled = false;
  constructor(
    private provider: OpenArtProvider,
    private readonly database: JobDatabase,
    private readonly emit: (jobs: JobRecord[]) => void,
  ) {}
  setProvider(provider: OpenArtProvider) {
    this.provider = provider;
  }
  pause() {
    this.paused = true;
    this.queue?.pause();
  }
  resume() {
    this.paused = false;
    this.queue?.start();
  }
  cancelPending() {
    this.cancelled = true;
    this.queue?.clear();
  }

  async resumePersisted() {
    const persisted = this.database.all();
    for (const job of persisted.filter(
      (candidate) =>
        !candidate.generationId && ['preparing', 'uploading', 'submitting'].includes(candidate.status),
    )) {
      job.status = 'interrupted';
      job.failureStage = 'interrupted_before_submission';
      job.error = 'Previous application session ended before OpenArt submission.';
      job.providerErrorMessage = job.error;
      job.endedAt = new Date().toISOString();
      job.lastStatusAt = job.endedAt;
      this.database.upsert(job);
    }
    const resumable = this.database
      .all()
      .filter(
        (job) =>
          Boolean(job.generationId) &&
          ['submitted', 'queued', 'processing', 'downloading'].includes(job.status),
      );
    for (const job of resumable) await this.recoverPersisted(job);
    this.emit(this.database.all());
    return resumable.map((job) => this.database.all().find((current) => current.id === job.id)!);
  }
  async run(
    rows: MappingRow[],
    inputRoot: string,
    outputRoot: string,
    settings: BatchSettings,
    dryRun: boolean,
    options: {
      runId?: string;
      expectedFingerprint?: string;
      preSubmitValidation?: () => Promise<void>;
      onPersisted?: (jobs: JobRecord[]) => void;
    } = {},
  ) {
    const durableOutputRoot = await validateOutputDirectory(
      outputRoot,
      dryRun || this.provider.name === 'mock' || process.env.OPENART_FAKE_CLI_E2E === '1',
    );
    if (rows.some((row) => row.enabled && row.status === 'error'))
      throw new Error(
        'Batch has blocking validation errors. Fix mappings before spending credits.',
      );
    const existing = this.database.all();
    if (!dryRun && !options.runId) {
      const unsafePrior = rows.find((row) => {
        const prior = existing.find((job) => (job.mappingId ?? job.id) === row.id);
        return prior?.status === 'failed' || prior?.status === 'failed_before_submission';
      });
      if (unsafePrior)
        throw new Error(
          `Job ${unsafePrior.id} has a prior failed or uncertain submission and cannot be automatically resubmitted.`,
        );
    }
    const resumeCandidate = !options.runId
      ? existing.find(
          (job) =>
            Boolean(job.generationId) &&
            ['submitting', 'submitted', 'queued', 'processing', 'downloading'].includes(
              job.status,
            ) &&
            rows.some((row) => (job.mappingId ?? job.id) === row.id),
        )
      : undefined;
    const runId =
      options.runId ??
      resumeCandidate?.runId ??
      `resume-${resumeCandidate?.id ?? crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();
    const batchFingerprint =
      options.expectedFingerprint ??
      crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            rows: rows.filter((row) => row.enabled),
            inputRoot,
            outputRoot,
            settings,
          }),
        )
        .digest('hex');
    this.database.createRun(
      {
        runId,
        createdAt,
        startedAt: createdAt,
        status: 'preparing',
        batchFingerprint,
        inputRoot,
        outputRoot: durableOutputRoot,
        settings,
      },
      inputRoot,
      durableOutputRoot,
    );
    const jobs = await Promise.all(
      rows
        .filter((row) => row.enabled)
        .map(async (row): Promise<JobRecord> => {
          const productDir = path.join(durableOutputRoot, row.outputGroup ?? row.product);
          const requested = path.join(productDir, row.outputName);
          const outputPath = settings.overwrite
            ? requested
            : versionOutputPath(requested, (candidate) =>
                existing.some((job) => job.outputPath === candidate && job.status === 'completed'),
              );
          const completedPrior = existing.find(
            (job) =>
              (job.mappingId ?? job.id) === row.id &&
              job.status === 'completed' &&
              job.outputExists !== false,
          );
          const incompletePrior = !options.runId
            ? existing.find(
                (job) =>
                  (job.mappingId ?? job.id) === row.id &&
                  Boolean(job.generationId) &&
                  ['submitting', 'submitted', 'queued', 'processing', 'downloading'].includes(
                    job.status,
                  ),
              )
            : undefined;
          return {
            id: incompletePrior?.id ?? crypto.randomUUID(),
            runId,
            mappingId: row.id,
            product: row.product,
            promptKey: row.promptKey,
            promptFile: row.promptFile,
            completePrompt: row.completePrompt,
            references: row.orderedInputs.map((input) => input.image.path),
            sourceMappings: row.sourceImages?.map((source) => ({
              path: source.path,
              name: source.name,
              detectedRole: source.detectedRole,
              role: source.role,
            })),
            orderedInputs: incompletePrior?.orderedInputs?.length
              ? incompletePrior.orderedInputs
              : await createInputRecords(row.orderedInputs),
            outputPath:
              incompletePrior?.outputPath ??
              (completedPrior && !settings.overwrite ? completedPrior.outputPath : outputPath),
            model: settings.model,
            settings,
            generationId: incompletePrior?.generationId,
            status: dryRun
              ? 'ready'
              : incompletePrior
                ? 'processing'
                : completedPrior && !settings.overwrite
                  ? 'skipped'
                  : 'preparing',
            attemptCount: incompletePrior?.attemptCount ?? 0,
            retries: incompletePrior?.retries ?? 0,
            createdAt: incompletePrior?.createdAt ?? createdAt,
            startedAt: incompletePrior?.startedAt ?? createdAt,
            submittedAt: incompletePrior?.submittedAt,
            lastStatusAt: createdAt,
            hidden: false,
            batchFingerprint,
            estimatedCredits: settings.estimatedCredits,
            dryRunDiagnostics: settings.dryRunDiagnostics,
          };
        }),
    );
    if (dryRun) return jobs;
    jobs.forEach((job) => this.database.upsert(job));
    this.emit(this.database.all());
    options.onPersisted?.(jobs);
    try {
      await options.preSubmitValidation?.();
    } catch (error) {
      const endedAt = new Date().toISOString();
      for (const job of jobs.filter((candidate) => candidate.status === 'preparing')) {
        job.status = 'failed_before_submission';
        job.failureStage = 'failed_before_submission';
        job.error = error instanceof Error ? error.message : 'Local validation failed.';
        job.providerErrorMessage = job.error;
        job.endedAt = endedAt;
        job.lastStatusAt = endedAt;
        this.database.upsert(job);
      }
      this.emit(this.database.all());
      return jobs;
    }
    this.cancelled = false;
    this.queue = new PQueue({
      concurrency: settings.concurrency,
      autoStart: true,
    });
    const assets = new Map<string, string>();
    for (const job of jobs)
      if (['preparing', 'submitting', 'submitted', 'queued', 'processing', 'downloading'].includes(job.status))
        this.queue.add(() =>
          this.process(
            job,
            rows.find((row) => row.id === job.mappingId)!,
            assets,
            inputRoot,
            settings,
          ),
        );
    await this.queue.onIdle();
    const finished = this.database.all();
    await writeReports(durableOutputRoot, finished);
    for (const product of new Set(finished.map((job) => job.product))) {
      await writeReports(
        path.join(durableOutputRoot, product),
        finished.filter((job) => job.product === product),
      );
    }
    return finished.filter((job) => job.runId === runId);
  }
  private async process(
    job: JobRecord,
    row: MappingRow,
    assets: Map<string, string>,
    _inputRoot: string,
    settings: BatchSettings,
  ) {
    if (this.cancelled) return;
    let attempt = 0;
    let stage: JobFailureStage = 'uploading';
    while (attempt <= settings.retryLimit) {
      try {
        stage = 'uploading';
        job.status = 'uploading';
        job.lastStatusAt = new Date().toISOString();
        this.database.upsert(job);
        this.emit(this.database.all());
        const assetIds: string[] = [];
        for (const [index, input] of row.orderedInputs.entries()) {
          const ref = input.image;
          const record = job.orderedInputs[index];
          if (!record.uploadedUrl && !assets.has(record.sha256)) {
            const ids = await this.provider.uploadReferences([ref]);
            assets.set(record.sha256, ids[0]);
            record.uploadedUrl = ids[0];
            record.uploadedAt = new Date().toISOString();
            this.database.upsert(job);
          }
          const uploadedUrl = record.uploadedUrl ?? assets.get(record.sha256);
          if (!uploadedUrl) throw new Error(`Reference upload missing for ${ref.name}.`);
          record.uploadedUrl = uploadedUrl;
          assetIds.push(uploadedUrl);
        }
        if (this.paused)
          await new Promise<void>((resolve) => {
            const timer = setInterval(() => {
              if (!this.paused) {
                clearInterval(timer);
                resolve();
              }
            }, 100);
          });
        stage = 'submission_failed';
        job.status = 'submitting';
        job.lastStatusAt = new Date().toISOString();
        this.database.upsert(job);
        this.emit(this.database.all());
        const before = await this.provider.status().catch(() => undefined);
        if (before?.credits !== undefined) {
          job.balanceBefore = before.credits;
          this.database.upsert(job);
        }
        if (!job.generationId) {
          const attemptCount = (job.attemptCount ?? 0) + 1;
          job.attemptCount = attemptCount;
          job.retries = Math.max(0, attemptCount - 1);
          this.database.upsert(job);
        }
        const handle = job.generationId
          ? { generationId: job.generationId }
          : await this.provider.generate(
              {
                prompt: row.completePrompt ?? '',
                references: row.orderedInputs.map((input) => input.image),
                orderedInputs: row.orderedInputs,
                settings,
              },
              assetIds,
            );
        job.generationId = handle.generationId;
        job.rawOutputPath = job.outputPath;
        job.status = 'submitted';
        job.submittedAt = new Date().toISOString();
        job.lastStatusAt = job.submittedAt;
        this.database.upsert(job);
        this.emit(this.database.all());
        job.status = 'queued';
        job.lastStatusAt = new Date().toISOString();
        this.database.upsert(job);
        this.emit(this.database.all());
        job.status = 'processing';
        job.lastStatusAt = new Date().toISOString();
        this.database.upsert(job);
        this.emit(this.database.all());
        stage = 'polling_failed';
        const result = await this.provider.waitForResult(handle, undefined, (update) => {
          job.status = update.status;
          job.lastStatusAt = update.checkedAt;
          this.database.upsert(job);
          this.emit(this.database.all());
        });
        const after = await this.provider.status().catch(() => undefined);
        job.status = 'downloading';
        job.lastStatusAt = new Date().toISOString();
        stage = result.resultUrls.length ? 'download_failed' : 'result_url_missing';
        this.database.upsert(job);
        this.emit(this.database.all());
        const rawOutputPath = job.rawOutputPath;
        if (!rawOutputPath) throw new Error('Raw output path was not persisted before download.');
        await atomicDownload(
          rawOutputPath,
          (temp) => this.provider.downloadResult(result.resultUrls[0], temp),
          async (temp) => {
            const header = await fs.readFile(temp, { encoding: 'hex', flag: 'r' });
            return (
              header.startsWith('89504e47') ||
              header.startsWith('ffd8ff') ||
              header.startsWith('52494646')
            );
          },
        );
        job.finalOutputPath = rawOutputPath;
        job.status = 'completed';
        job.failureStage = undefined;
        const balanceDifference =
          before?.credits !== undefined && after?.credits !== undefined
            ? before.credits - after.credits
            : undefined;
        job.creditsUsed = result.creditsUsed ?? balanceDifference;
        job.balanceAfter = after?.credits;
        job.actualCreditsSource =
          result.creditsUsed !== undefined
            ? 'provider'
            : balanceDifference !== undefined
              ? 'balance-derived'
              : undefined;
        job.creditDifference =
          job.estimatedCredits !== undefined && job.creditsUsed !== undefined
            ? job.creditsUsed - job.estimatedCredits
            : undefined;
        job.endedAt = new Date().toISOString();
        job.lastStatusAt = job.endedAt;
        this.database.upsert(job);
        this.emit(this.database.all());
        return;
      } catch (error) {
        job.failureStage = stage;
        job.error = error instanceof Error ? error.message : 'Unknown error';
        const providerError = extractProviderError(error);
        job.providerErrorCode = providerError.code;
        job.providerErrorMessage = providerError.message;
        if (job.generationId && stage === 'polling_failed')
          job.failureStage = /failed|error|cancelled/i.test(job.error)
            ? 'provider_generation_failed'
            : 'polling_failed';
        const canRetryBeforeSubmission =
          !job.generationId && stage === 'uploading' && isRetryable(error);
        if (!canRetryBeforeSubmission || attempt >= settings.retryLimit) {
          job.status = 'failed';
          job.endedAt = new Date().toISOString();
          job.lastStatusAt = job.endedAt;
          job.retries = Math.max(0, (job.attemptCount ?? 0) - 1);
          this.database.upsert(job);
          this.emit(this.database.all());
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
        attempt += 1;
      }
    }
  }

  private async recoverPersisted(job: JobRecord) {
    try {
      job.status = 'processing';
      job.lastStatusAt = new Date().toISOString();
      this.database.upsert(job);
      this.emit(this.database.all());
      const result = await this.provider.waitForResult(
        { generationId: job.generationId! },
        undefined,
        (update) => {
          job.status = update.status;
          job.lastStatusAt = update.checkedAt;
          this.database.upsert(job);
          this.emit(this.database.all());
        },
      );
      job.status = 'downloading';
      job.lastStatusAt = new Date().toISOString();
      this.database.upsert(job);
      this.emit(this.database.all());
      if (!result.resultUrls[0]) throw new Error('OpenArt result did not contain an output URL.');
      job.rawOutputPath = job.rawOutputPath ?? job.outputPath;
      await atomicDownload(
        job.rawOutputPath,
        (temp) => this.provider.downloadResult(result.resultUrls[0], temp),
        async (temp) => {
          const header = await fs.readFile(temp, { encoding: 'hex', flag: 'r' });
          return (
            header.startsWith('89504e47') ||
            header.startsWith('ffd8ff') ||
            header.startsWith('52494646')
          );
        },
      );
      job.finalOutputPath = job.rawOutputPath;
      job.status = 'completed';
      job.failureStage = undefined;
      job.error = undefined;
      job.creditsUsed = result.creditsUsed;
      job.endedAt = new Date().toISOString();
      job.lastStatusAt = job.endedAt;
    } catch (error) {
      const wasDownloading = job.status === 'downloading';
      job.status = 'failed';
      job.failureStage = wasDownloading
        ? 'download_failed'
        : (job.failureStage ?? 'polling_failed');
      const providerError = extractProviderError(error);
      job.error = providerError.message;
      job.providerErrorCode = providerError.code;
      job.providerErrorMessage = providerError.message;
      job.endedAt = new Date().toISOString();
      job.lastStatusAt = job.endedAt;
    }
    this.database.upsert(job);
    this.emit(this.database.all());
  }
}

function extractProviderError(error: unknown) {
  if (!(error instanceof Error)) return { message: 'Unknown provider error' };
  const structured = error as Error & {
    code?: unknown;
    providerCode?: unknown;
    providerMessage?: unknown;
  };
  return {
    code:
      typeof structured.providerCode === 'string'
        ? structured.providerCode
        : typeof structured.code === 'string'
          ? structured.code
          : undefined,
    message:
      typeof structured.providerMessage === 'string' ? structured.providerMessage : error.message,
  };
}
