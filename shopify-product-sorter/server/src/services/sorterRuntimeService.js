import crypto from "node:crypto";
import db from "../db/database.js";

const ACTIVE_STATUSES = new Set(["running", "processing"]);
const DEFAULT_STALE_MS = 15 * 60 * 1000;
let currentRunContext = null;

db.exec(`
  CREATE TABLE IF NOT EXISTS sorter_runs (
    id TEXT PRIMARY KEY,
    run_type TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    total_collections INTEGER NOT NULL DEFAULT 0,
    eligible_collections INTEGER NOT NULL DEFAULT 0,
    succeeded INTEGER NOT NULL DEFAULT 0,
    failed INTEGER NOT NULL DEFAULT 0,
    skipped INTEGER NOT NULL DEFAULT 0,
    unchanged INTEGER NOT NULL DEFAULT 0,
    moved_products INTEGER NOT NULL DEFAULT 0,
    current_collection_id TEXT,
    current_collection_title TEXT,
    error_message TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS sorter_action_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    action_type TEXT NOT NULL,
    action_label TEXT NOT NULL,
    status TEXT NOT NULL,
    collection_id TEXT,
    collection_title TEXT,
    actor TEXT,
    processed_count INTEGER,
    moved_count INTEGER,
    unchanged_count INTEGER,
    success_count INTEGER,
    failed_count INTEGER,
    skipped_count INTEGER,
    duration_ms INTEGER,
    error_message TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS sorter_network_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT,
    collection_id TEXT,
    collection_title TEXT,
    provider TEXT NOT NULL,
    operation_name TEXT NOT NULL,
    method TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    status_code INTEGER,
    status TEXT NOT NULL,
    graphql_error INTEGER NOT NULL DEFAULT 0,
    user_error INTEGER NOT NULL DEFAULT 0,
    retry_count INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER,
    rate_limit_json TEXT,
    error_message TEXT,
    metadata_json TEXT NOT NULL DEFAULT '{}',
    started_at TEXT NOT NULL,
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS sorter_runs_type_status_idx
    ON sorter_runs(run_type, status, started_at DESC);
  CREATE INDEX IF NOT EXISTS sorter_action_logs_created_idx
    ON sorter_action_logs(created_at DESC, id DESC);
  CREATE INDEX IF NOT EXISTS sorter_network_logs_started_idx
    ON sorter_network_logs(started_at DESC, id DESC);
`);

function nowIso() {
  return new Date().toISOString();
}

function parseJson(value, fallback = {}) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapRun(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    runType: row.run_type,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    totalCollections: row.total_collections,
    eligibleCollections: row.eligible_collections,
    succeeded: row.succeeded,
    failed: row.failed,
    skipped: row.skipped,
    unchanged: row.unchanged,
    movedProducts: row.moved_products,
    currentCollectionId: row.current_collection_id,
    currentCollectionTitle: row.current_collection_title,
    errorMessage: row.error_message,
    metadata: parseJson(row.metadata_json),
  };
}

function mapActionLog(row) {
  return {
    id: row.id,
    runId: row.run_id,
    actionType: row.action_type,
    actionLabel: row.action_label,
    status: row.status,
    collectionId: row.collection_id,
    collectionTitle: row.collection_title,
    actor: row.actor,
    processedCount: row.processed_count,
    movedCount: row.moved_count,
    unchangedCount: row.unchanged_count,
    successCount: row.success_count,
    failedCount: row.failed_count,
    skippedCount: row.skipped_count,
    durationMs: row.duration_ms,
    errorMessage: row.error_message,
    metadata: parseJson(row.metadata_json),
    timestamp: row.created_at,
    completedAt: row.completed_at,
  };
}

function mapNetworkLog(row) {
  return {
    id: row.id,
    runId: row.run_id,
    collectionId: row.collection_id,
    collectionTitle: row.collection_title,
    provider: row.provider,
    operationName: row.operation_name,
    method: row.method,
    endpoint: row.endpoint,
    statusCode: row.status_code,
    status: row.status,
    graphqlError: Boolean(row.graphql_error),
    userError: Boolean(row.user_error),
    retryCount: row.retry_count,
    durationMs: row.duration_ms,
    rateLimit: parseJson(row.rate_limit_json, null),
    errorMessage: row.error_message,
    metadata: parseJson(row.metadata_json),
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export function recoverStaleRuns(runType, staleMs = DEFAULT_STALE_MS) {
  const cutoff = new Date(Date.now() - staleMs).toISOString();
  db.prepare(
    `UPDATE sorter_runs
      SET status = 'failed',
          finished_at = ?,
          error_message = COALESCE(error_message, 'Recovered stale run after process interruption.')
      WHERE run_type = ?
        AND status IN ('running', 'processing')
        AND started_at < ?`,
  ).run(nowIso(), runType, cutoff);
}

export function getActiveRun(runType) {
  const row = db.prepare(
    `SELECT *
      FROM sorter_runs
      WHERE run_type = ?
        AND status IN ('running', 'processing')
      ORDER BY started_at DESC
      LIMIT 1`,
  ).get(runType);
  return mapRun(row);
}

export function createRun(runType, metadata = {}) {
  const id = crypto.randomUUID();
  const startedAt = nowIso();
  db.prepare(
    `INSERT INTO sorter_runs (
      id, run_type, status, started_at, metadata_json
    ) VALUES (?, ?, 'running', ?, ?)`,
  ).run(id, runType, startedAt, JSON.stringify(metadata));
  return getRun(id);
}

export function getRun(runId) {
  const row = db.prepare(`SELECT * FROM sorter_runs WHERE id = ?`).get(runId);
  return mapRun(row);
}

export function listRuns(runType, limit = 10) {
  const rows = db.prepare(
    `SELECT *
      FROM sorter_runs
      WHERE run_type = ?
      ORDER BY started_at DESC
      LIMIT ?`,
  ).all(runType, limit);
  return rows.map(mapRun);
}

export function updateRun(runId, patch = {}) {
  const current = getRun(runId);
  if (!current) {
    return null;
  }

  const next = {
    ...current,
    ...patch,
    metadata: {
      ...(current.metadata || {}),
      ...(patch.metadata || {}),
    },
  };

  db.prepare(
    `UPDATE sorter_runs
      SET status = ?,
          finished_at = ?,
          total_collections = ?,
          eligible_collections = ?,
          succeeded = ?,
          failed = ?,
          skipped = ?,
          unchanged = ?,
          moved_products = ?,
          current_collection_id = ?,
          current_collection_title = ?,
          error_message = ?,
          metadata_json = ?
      WHERE id = ?`,
  ).run(
    next.status,
    next.finishedAt ?? current.finishedAt ?? null,
    next.totalCollections ?? 0,
    next.eligibleCollections ?? 0,
    next.succeeded ?? 0,
    next.failed ?? 0,
    next.skipped ?? 0,
    next.unchanged ?? 0,
    next.movedProducts ?? 0,
    next.currentCollectionId ?? null,
    next.currentCollectionTitle ?? null,
    next.errorMessage ?? null,
    JSON.stringify(next.metadata || {}),
    runId,
  );

  return getRun(runId);
}

export function finishRun(runId, patch = {}) {
  return updateRun(runId, {
    ...patch,
    finishedAt: patch.finishedAt ?? nowIso(),
  });
}

export function addActionLog(entry) {
  const createdAt = entry.timestamp || nowIso();
  const result = db.prepare(
    `INSERT INTO sorter_action_logs (
      run_id, action_type, action_label, status, collection_id, collection_title,
      actor, processed_count, moved_count, unchanged_count, success_count,
      failed_count, skipped_count, duration_ms, error_message, metadata_json,
      created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.runId ?? null,
    entry.actionType,
    entry.actionLabel,
    entry.status,
    entry.collectionId ?? null,
    entry.collectionTitle ?? null,
    entry.actor ?? null,
    entry.processedCount ?? null,
    entry.movedCount ?? null,
    entry.unchangedCount ?? null,
    entry.successCount ?? null,
    entry.failedCount ?? null,
    entry.skippedCount ?? null,
    entry.durationMs ?? null,
    entry.errorMessage ?? null,
    JSON.stringify(entry.metadata || {}),
    createdAt,
    entry.completedAt ?? null,
  );

  const row = db.prepare(`SELECT * FROM sorter_action_logs WHERE id = ?`).get(result.lastInsertRowid);
  return mapActionLog(row);
}

export function listActionLogs({ afterId = 0, limit = 30 } = {}) {
  const rows = db.prepare(
    `SELECT *
      FROM sorter_action_logs
      WHERE id > ?
      ORDER BY id DESC
      LIMIT ?`,
  ).all(afterId, limit);
  return rows.map(mapActionLog);
}

export function clearNetworkLogs() {
  db.prepare(`DELETE FROM sorter_network_logs`).run();
}

export function addNetworkLog(entry) {
  const startedAt = entry.startedAt || nowIso();
  const result = db.prepare(
    `INSERT INTO sorter_network_logs (
      run_id, collection_id, collection_title, provider, operation_name,
      method, endpoint, status_code, status, graphql_error, user_error,
      retry_count, duration_ms, rate_limit_json, error_message, metadata_json,
      started_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    entry.runId ?? null,
    entry.collectionId ?? null,
    entry.collectionTitle ?? null,
    entry.provider,
    entry.operationName,
    entry.method,
    entry.endpoint,
    entry.statusCode ?? null,
    entry.status,
    entry.graphqlError ? 1 : 0,
    entry.userError ? 1 : 0,
    entry.retryCount ?? 0,
    entry.durationMs ?? null,
    entry.rateLimit ? JSON.stringify(entry.rateLimit) : null,
    entry.errorMessage ?? null,
    JSON.stringify(entry.metadata || {}),
    startedAt,
    entry.completedAt ?? null,
  );

  // Bounded size check - keep latest 200 logs
  db.prepare(`DELETE FROM sorter_network_logs WHERE id <= (SELECT MAX(id) - 200 FROM sorter_network_logs)`).run();

  const row = db.prepare(`SELECT * FROM sorter_network_logs WHERE id = ?`).get(result.lastInsertRowid);
  return mapNetworkLog(row);
}

export function listNetworkLogs({ afterId = 0, limit = 30 } = {}) {
  const rows = db.prepare(
    `SELECT *
      FROM sorter_network_logs
      WHERE id > ?
      ORDER BY id DESC
      LIMIT ?`,
  ).all(afterId, limit);
  return rows.map(mapNetworkLog);
}

export function isRunActive(run) {
  return Boolean(run && ACTIVE_STATUSES.has(run.status));
}

export function setCurrentSorterRunContext(context) {
  currentRunContext = context ? { ...context } : null;
}

export function clearCurrentSorterRunContext() {
  currentRunContext = null;
}

export function getCurrentSorterRunContext() {
  return currentRunContext ? { ...currentRunContext } : null;
}
