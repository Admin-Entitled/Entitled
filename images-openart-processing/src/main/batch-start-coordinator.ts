import type { BatchSettings, JobRecord, MappingRow } from '../shared/types.js';
import type { JobDatabase } from './db.js';
import type { BatchEngine } from './engine.js';

export interface BatchStartRequest {
  requestId: string;
  rows: MappingRow[];
  inputRoot: string;
  outputRoot: string;
  settings: BatchSettings;
  preSubmitValidation: () => Promise<void>;
  expectedFingerprint?: string;
}

export interface BatchStartResult {
  runId: string;
  jobs: JobRecord[];
}

export class BatchStartCoordinator {
  private readonly active = new Map<string, Promise<BatchStartResult>>();

  constructor(
    private readonly engine: BatchEngine,
    private readonly database: JobDatabase,
  ) {}

  start(request: BatchStartRequest): Promise<BatchStartResult> {
    const persisted = this.database.byRun(request.requestId);
    if (persisted.length) return Promise.resolve({ runId: request.requestId, jobs: persisted });
    const active = this.active.get(request.requestId);
    if (active) return active;
    let persistedOrFailed = false;
    const started = new Promise<BatchStartResult>((resolve, reject) => {
      void this.engine
        .run(request.rows, request.inputRoot, request.outputRoot, request.settings, false, {
          runId: request.requestId,
          expectedFingerprint: request.expectedFingerprint,
          preSubmitValidation: request.preSubmitValidation,
          onPersisted: (jobs) => {
            persistedOrFailed = true;
            resolve({ runId: request.requestId, jobs });
          },
        })
        .catch((error) => {
          if (!persistedOrFailed) reject(error);
        });
    });
    this.active.set(request.requestId, started);
    void started.finally(() => this.active.delete(request.requestId));
    return started;
  }
}
