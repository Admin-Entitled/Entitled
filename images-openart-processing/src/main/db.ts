import Database from 'better-sqlite3';
import fs from 'node:fs';
import type { JobRecord, RunRecord, UploadedInputRecord } from '../shared/types.js';

const CURRENT_SCHEMA_VERSION = 10;

export class JobDatabase {
  private readonly db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY, product TEXT NOT NULL, prompt_key TEXT NOT NULL,
        prompt_file TEXT, references_json TEXT NOT NULL, output_path TEXT NOT NULL,
        model TEXT NOT NULL, settings_json TEXT NOT NULL, generation_id TEXT,
        status TEXT NOT NULL, retries INTEGER NOT NULL DEFAULT 0, error TEXT,
        started_at TEXT, ended_at TEXT, credits_used REAL
      )`,
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY, created_at TEXT NOT NULL, started_at TEXT,
        ended_at TEXT, status TEXT NOT NULL, batch_fingerprint TEXT NOT NULL,
        input_root TEXT NOT NULL, output_root TEXT NOT NULL, settings_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS job_inputs (
        job_id TEXT NOT NULL, input_order INTEGER NOT NULL, role TEXT NOT NULL,
        local_path TEXT NOT NULL, sha256 TEXT NOT NULL, size INTEGER,
        mime_type TEXT, uploaded_url TEXT, uploaded_at TEXT,
        PRIMARY KEY(job_id, input_order)
      );
      CREATE TABLE IF NOT EXISTS job_events (
        job_id TEXT NOT NULL, sequence INTEGER NOT NULL, stage TEXT NOT NULL,
        timestamp TEXT NOT NULL, details_json TEXT, PRIMARY KEY(job_id, sequence)
      );
    `);
    this.migrate();
  }

  get schemaVersion() {
    return Number(this.db.pragma('user_version', { simple: true }));
  }

  private migrate() {
    const columns = new Set(
      (this.db.prepare('PRAGMA table_info(jobs)').all() as Array<{ name: string }>).map(
        (column) => column.name,
      ),
    );
    const additions: Array<[string, string]> = [
      ['ordered_inputs_json', "TEXT NOT NULL DEFAULT '[]'"],
      ['complete_prompt', 'TEXT'],
      ['estimated_credits', 'REAL'],
      ['credit_difference', 'REAL'],
      ['actual_credits_source', 'TEXT'],
      ['source_mappings_json', "TEXT NOT NULL DEFAULT '[]'"],
      ['dry_run_diagnostics_json', 'TEXT'],
      ['balance_before', 'REAL'],
      ['balance_after', 'REAL'],
      ['attempt_count', 'INTEGER NOT NULL DEFAULT 0'],
      ['failure_stage', 'TEXT'],
      ['run_id', 'TEXT'],
      ['mapping_id', 'TEXT'],
      ['created_at', 'TEXT'],
      ['submitted_at', 'TEXT'],
      ['last_status_at', 'TEXT'],
      ['provider_error_code', 'TEXT'],
      ['provider_error_message', 'TEXT'],
      ['hidden', 'INTEGER NOT NULL DEFAULT 0'],
      ['prompt_hash', 'TEXT'],
      ['batch_fingerprint', 'TEXT'],
      ['raw_output_path', 'TEXT'],
      ['final_output_path', 'TEXT'],
    ];
    for (const [name, definition] of additions)
      if (!columns.has(name)) this.db.exec(`ALTER TABLE jobs ADD COLUMN ${name} ${definition}`);
    this.db.exec(
      `UPDATE jobs
       SET attempt_count = 1
       WHERE attempt_count = 0 AND generation_id IS NOT NULL`,
    );
    this.db.exec(
      `UPDATE jobs
       SET failure_stage = 'provider_generation_failed'
       WHERE status = 'failed'
         AND failure_stage IS NULL
         AND error LIKE '%generation % ended with status%'`,
    );
    this.db.exec('UPDATE jobs SET retries = MAX(0, attempt_count - 1)');
    this.db.exec(`UPDATE jobs SET mapping_id = id WHERE mapping_id IS NULL`);
    this.db.exec(
      `UPDATE jobs SET created_at = COALESCE(started_at, ended_at) WHERE created_at IS NULL`,
    );
    this.db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
  }

  upsert(job: JobRecord) {
    const previous = this.db.prepare('SELECT status FROM jobs WHERE id = ?').get(job.id) as
      { status?: string } | undefined;
    this.db
      .prepare(
        `INSERT INTO jobs (
          id,product,prompt_key,prompt_file,references_json,output_path,model,settings_json,
          generation_id,status,retries,error,started_at,ended_at,credits_used,
          ordered_inputs_json,complete_prompt,estimated_credits,credit_difference,actual_credits_source
          ,source_mappings_json
          ,dry_run_diagnostics_json
          ,balance_before,balance_after,attempt_count,failure_stage
          ,run_id,mapping_id,created_at,submitted_at,last_status_at
          ,provider_error_code,provider_error_message,hidden
          ,prompt_hash,batch_fingerprint,raw_output_path,final_output_path
        ) VALUES (
          @id,@product,@promptKey,@promptFile,@references,@outputPath,@model,@settings,
          @generationId,@status,@retries,@error,@startedAt,@endedAt,@creditsUsed,
          @orderedInputs,@completePrompt,@estimatedCredits,@creditDifference,@actualCreditsSource
          ,@sourceMappings
          ,@dryRunDiagnostics
          ,@balanceBefore,@balanceAfter,@attemptCount,@failureStage
          ,@runId,@mappingId,@createdAt,@submittedAt,@lastStatusAt
          ,@providerErrorCode,@providerErrorMessage,@hidden
          ,@promptHash,@batchFingerprint,@rawOutputPath,@finalOutputPath
        ) ON CONFLICT(id) DO UPDATE SET
          status=@status,retries=@retries,error=@error,generation_id=@generationId,
          started_at=@startedAt,ended_at=@endedAt,credits_used=@creditsUsed,
          ordered_inputs_json=@orderedInputs,complete_prompt=@completePrompt,
          estimated_credits=@estimatedCredits,credit_difference=@creditDifference,
          actual_credits_source=@actualCreditsSource,output_path=@outputPath,settings_json=@settings,
          source_mappings_json=@sourceMappings,dry_run_diagnostics_json=@dryRunDiagnostics,
          balance_before=@balanceBefore,balance_after=@balanceAfter,
          attempt_count=@attemptCount,failure_stage=@failureStage,
          run_id=@runId,mapping_id=@mappingId,created_at=@createdAt,
          submitted_at=@submittedAt,last_status_at=@lastStatusAt,
          provider_error_code=@providerErrorCode,provider_error_message=@providerErrorMessage,
          hidden=@hidden,prompt_hash=@promptHash,batch_fingerprint=@batchFingerprint,
          raw_output_path=@rawOutputPath,final_output_path=@finalOutputPath`,
      )
      .run({
        ...job,
        attemptCount: job.attemptCount ?? (job.generationId ? 1 : 0),
        retries: Math.max(0, (job.attemptCount ?? (job.generationId ? 1 : 0)) - 1),
        references: JSON.stringify(job.references),
        orderedInputs: JSON.stringify(job.orderedInputs ?? []),
        settings: JSON.stringify(job.settings),
        promptKey: job.promptKey,
        promptFile: job.promptFile ?? null,
        completePrompt: job.completePrompt ?? null,
        generationId: job.generationId ?? null,
        error: job.error ?? null,
        startedAt: job.startedAt ?? null,
        endedAt: job.endedAt ?? null,
        creditsUsed: job.creditsUsed ?? null,
        estimatedCredits: job.estimatedCredits ?? null,
        creditDifference: job.creditDifference ?? null,
        actualCreditsSource: job.actualCreditsSource ?? null,
        sourceMappings: JSON.stringify(job.sourceMappings ?? []),
        dryRunDiagnostics: job.dryRunDiagnostics ? JSON.stringify(job.dryRunDiagnostics) : null,
        balanceBefore: job.balanceBefore ?? null,
        balanceAfter: job.balanceAfter ?? null,
        failureStage: job.failureStage ?? null,
        runId: job.runId ?? null,
        mappingId: job.mappingId ?? null,
        createdAt: job.createdAt ?? null,
        submittedAt: job.submittedAt ?? null,
        lastStatusAt: job.lastStatusAt ?? null,
        providerErrorCode: job.providerErrorCode ?? null,
        providerErrorMessage: job.providerErrorMessage ?? null,
        hidden: job.hidden ? 1 : 0,
        promptHash: job.promptHash ?? null,
        batchFingerprint: job.batchFingerprint ?? null,
        rawOutputPath: job.rawOutputPath ?? null,
        finalOutputPath: job.finalOutputPath ?? null,
      });
    if (job.runId) {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO runs
        (run_id,created_at,status,batch_fingerprint,input_root,output_root,settings_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          job.runId,
          job.createdAt ?? new Date().toISOString(),
          job.status,
          job.batchFingerprint ?? '',
          '',
          pathForJob(job),
          JSON.stringify(job.settings),
        );
      this.db.prepare('DELETE FROM job_inputs WHERE job_id = ?').run(job.id);
      const insertInput = this.db.prepare(`INSERT INTO job_inputs
        (job_id,input_order,role,local_path,sha256,uploaded_url,uploaded_at)
        VALUES (@jobId,@order,@role,@localPath,@sha256,@uploadedUrl,@uploadedAt)`);
      for (const input of job.orderedInputs ?? [])
        insertInput.run({
          jobId: job.id,
          order: input.order,
          role: input.role,
          localPath: input.localPath,
          sha256: input.sha256,
          uploadedUrl: input.uploadedUrl ?? null,
          uploadedAt: input.uploadedAt ?? null,
        });
      if (!previous || previous.status !== job.status) this.appendEvent(job.id, job.status);
      this.db
        .prepare(
          "UPDATE runs SET status = ?, ended_at = CASE WHEN ? IN ('completed','failed','cancelled','interrupted') THEN ? ELSE ended_at END WHERE run_id = ?",
        )
        .run(job.status, job.status, job.endedAt ?? new Date().toISOString(), job.runId);
    }
  }

  createRun(run: RunRecord, inputRoot: string, outputRoot: string) {
    this.db
      .prepare(
        `INSERT INTO runs
      (run_id,created_at,started_at,ended_at,status,batch_fingerprint,input_root,output_root,settings_json)
      VALUES (@runId,@createdAt,@startedAt,@endedAt,@status,@fingerprint,@inputRoot,@outputRoot,@settings)`,
      )
      .run({
        runId: run.runId,
        createdAt: run.createdAt,
        startedAt: run.startedAt ?? null,
        endedAt: run.endedAt ?? null,
        status: run.status,
        fingerprint: run.batchFingerprint,
        inputRoot,
        outputRoot,
        settings: JSON.stringify(run.settings),
      });
  }

  updateRun(runId: string, status: string, endedAt?: string) {
    this.db
      .prepare('UPDATE runs SET status = ?, ended_at = COALESCE(?, ended_at) WHERE run_id = ?')
      .run(status, endedAt ?? null, runId);
  }

  appendEvent(jobId: string, stage: string, details?: unknown) {
    const sequence = this.db
      .prepare('SELECT COALESCE(MAX(sequence),0)+1 AS next FROM job_events WHERE job_id = ?')
      .get(jobId) as { next: number };
    this.db
      .prepare(
        'INSERT INTO job_events (job_id,sequence,stage,timestamp,details_json) VALUES (?,?,?,?,?)',
      )
      .run(
        jobId,
        sequence.next,
        stage,
        new Date().toISOString(),
        details ? JSON.stringify(details) : null,
      );
  }

  events(jobId: string) {
    return this.db
      .prepare('SELECT * FROM job_events WHERE job_id = ? ORDER BY sequence')
      .all(jobId);
  }

  all(): JobRecord[] {
    return (
      this.db
        .prepare(
          `SELECT * FROM jobs
           ORDER BY COALESCE(created_at,started_at,ended_at,'') DESC, rowid DESC`,
        )
        .all() as any[]
    ).map((row) => {
      const orderedInputs = parseJson<UploadedInputRecord[]>(row.ordered_inputs_json, []);
      const attemptCount = row.attempt_count || (row.generation_id ? 1 : 0);
      return {
        ...row,
        promptKey: row.prompt_key,
        promptFile: row.prompt_file,
        references: parseJson<string[]>(row.references_json, []),
        orderedInputs,
        sourceMappings: parseJson(row.source_mappings_json, []),
        dryRunDiagnostics: parseJson(row.dry_run_diagnostics_json, undefined),
        balanceBefore: row.balance_before ?? undefined,
        balanceAfter: row.balance_after ?? undefined,
        outputPath: row.output_path,
        settings: parseJson(row.settings_json, {}),
        completePrompt: row.complete_prompt ?? undefined,
        generationId: row.generation_id ?? undefined,
        attemptCount,
        retries: Math.max(0, attemptCount - 1),
        failureStage: row.failure_stage ?? undefined,
        runId: row.run_id ?? undefined,
        mappingId: row.mapping_id ?? undefined,
        createdAt: row.created_at ?? undefined,
        submittedAt: row.submitted_at ?? undefined,
        lastStatusAt: row.last_status_at ?? undefined,
        providerErrorCode: row.provider_error_code ?? undefined,
        providerErrorMessage: row.provider_error_message ?? undefined,
        hidden: Boolean(row.hidden),
        promptHash: row.prompt_hash ?? undefined,
        batchFingerprint: row.batch_fingerprint ?? undefined,
        rawOutputPath: row.raw_output_path ?? undefined,
        finalOutputPath: row.final_output_path ?? undefined,
        creditsUsed: row.credits_used ?? undefined,
        estimatedCredits: row.estimated_credits ?? undefined,
        creditDifference: row.credit_difference ?? undefined,
        actualCreditsSource: row.actual_credits_source ?? undefined,
        startedAt: row.started_at ?? undefined,
        endedAt: row.ended_at ?? undefined,
        outputExists: fs.existsSync(row.output_path),
      } as JobRecord;
    });
  }

  hide(id: string) {
    this.db.prepare('UPDATE jobs SET hidden = 1 WHERE id = ?').run(id);
  }

  byRun(runId: string) {
    return this.all().filter((job) => job.runId === runId);
  }

  updateProviderFailure(id: string, code: string, message: string) {
    this.db
      .prepare(
        `UPDATE jobs
         SET provider_error_code = ?, provider_error_message = ?, error = ?
         WHERE id = ?`,
      )
      .run(code, message, message, id);
  }

  close() {
    this.db.close();
  }
}

function pathForJob(job: JobRecord) {
  return job.outputPath ? requirePathDir(job.outputPath) : '';
}

function requirePathDir(file: string) {
  const slash = Math.max(file.lastIndexOf('/'), file.lastIndexOf('\\'));
  return slash > 0 ? file.slice(0, slash) : file;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
