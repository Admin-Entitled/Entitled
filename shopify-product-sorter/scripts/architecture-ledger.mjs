#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamically resolve REPO_ROOT to support cwd overrides in tests
const defaultRoot = path.resolve(__dirname, '..');
const cwdRoot = process.cwd();
const REPO_ROOT = (fs.existsSync(path.join(cwdRoot, 'docs', 'architecture', 'ledger', 'tasks.json')) || fs.existsSync(path.join(cwdRoot, 'docs', 'architecture', 'ledger')))
  ? cwdRoot
  : defaultRoot;

const LEDGER_DIR = path.join(REPO_ROOT, 'docs', 'architecture', 'ledger');
const TASKS_PATH = path.join(LEDGER_DIR, 'tasks.json');
const HISTORY_PATH = path.join(LEDGER_DIR, 'history.jsonl');
const SCHEMA_PATH = path.join(LEDGER_DIR, 'schema.json');
const SNAPSHOTS_DIR = path.join(LEDGER_DIR, 'snapshots');
const LOCK_PATH = path.join(LEDGER_DIR, '.lock');
const PLAN_MARKDOWN_PATH = path.join(REPO_ROOT, 'docs', 'architecture', 'ARCHITECTURE_REMEDIATION_MASTER_PLAN.md');
const OBSIDIAN_PENDING_PATH = '/home/shivam/Obsidian/Codex-Memory/Projects/shopify-product-sorter/pending-work.md';

const ALLOWED_STATES = [
  'not_started',
  'ready',
  'in_progress',
  'implemented',
  'validation_pending',
  'validated',
  'blocked',
  'completed',
  'deferred',
  'cancelled'
];

// Helper: Run shell command safely
function runCmd(cmd, options = {}) {
  try {
    return execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf-8', ...options }).trim();
  } catch (err) {
    if (err.status === 0) {
      return (err.stdout || '').trim();
    }
    if (options.allowError) {
      return (err.stdout || '') + (err.stderr || '');
    }
    throw err;
  }
}

/**
 * Convert an application-relative path to a repository-relative Git path.
 * Uses `git rev-parse --show-prefix` to determine the app directory prefix.
 * Normalizes separators to /, rejects absolute paths and .. traversal.
 * Returns null if the path cannot be resolved (e.g., already prefixed incorrectly).
 */
function resolveGitPath(appPath) {
  if (!appPath || typeof appPath !== 'string') return null;
  // Normalize separators
  let normalized = appPath.replace(/\\/g, '/');
  // Reject absolute paths
  if (path.isAbsolute(normalized)) return null;
  // Reject .. traversal
  if (normalized.includes('..')) return null;
  // Get the git prefix (e.g., "shopify-product-sorter/")
  let prefix = '';
  try {
    prefix = runCmd('git rev-parse --show-prefix', { allowError: true });
    // Ensure trailing slash
    if (prefix && !prefix.endsWith('/')) prefix += '/';
  } catch (e) {
    // If we can't get prefix, try running from REPO_ROOT
    try {
      prefix = runCmd('git rev-parse --show-prefix', { allowError: true, cwd: REPO_ROOT });
      if (prefix && !prefix.endsWith('/')) prefix += '/';
    } catch (e2) {
      prefix = '';
    }
  }
  // Avoid double-prefixing
  if (prefix && normalized.startsWith(prefix)) {
    return normalized;
  }
  return prefix + normalized;
}

// Lock file handling
let lockDepth = 0;

function acquireLock() {
  if (fs.existsSync(LOCK_PATH)) {
    try {
      const ownerPid = fs.readFileSync(LOCK_PATH, "utf-8").trim();
      if (ownerPid === String(process.pid)) {
        lockDepth++;
        return;
      }
    } catch (e) {}
  }
  const timeoutMs = 5000;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const fd = fs.openSync(LOCK_PATH, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      lockDepth = 1;
      return;
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      try {
        const stats = fs.statSync(LOCK_PATH);
        if (Date.now() - stats.mtimeMs > 30000) {
          fs.unlinkSync(LOCK_PATH);
          continue;
        }
      } catch (e) {}
      const stop = Date.now() + 50;
      while (Date.now() < stop) {}
    }
  }
  throw new Error(`Could not acquire ledger lock at ${LOCK_PATH} within ${timeoutMs}ms`);
}

function releaseLock() {
  try {
    if (lockDepth > 1) {
      lockDepth--;
      return;
    }
    lockDepth = 0;
    if (fs.existsSync(LOCK_PATH)) {
      fs.unlinkSync(LOCK_PATH);
    }
  } catch (err) {}
}

function withLock(fn) {
  acquireLock();
  try {
    return fn();
  } finally {
    releaseLock();
  }
}

// Canonical hash computation for history
function computeEntryHash(entry) {
  const payload = {
    timestamp: entry.timestamp,
    task_id: entry.task_id,
    previous_status: entry.previous_status,
    new_status: entry.new_status,
    reason: entry.reason,
    evidence_summary: entry.evidence_summary || '',
    branch: entry.branch || '',
    actor: entry.actor || '',
    previous_entry_hash: entry.previous_entry_hash
  };
  const sortedKeys = Object.keys(payload).sort();
  const sortedObj = {};
  for (const k of sortedKeys) {
    sortedObj[k] = payload[k];
  }
  const canonicalJson = JSON.stringify(sortedObj);
  return crypto.createHash('sha256').update(canonicalJson, 'utf-8').digest('hex');
}

// Ledger Verification
function validateHistoryChain(historyPath = HISTORY_PATH) {
  if (!fs.existsSync(historyPath)) {
    return { valid: false, error: 'history.jsonl file missing' };
  }
  const lines = fs.readFileSync(historyPath, 'utf-8').split('\n').filter(Boolean);
  if (lines.length === 0) {
    return { valid: false, error: 'history.jsonl is empty' };
  }

  let expectedPrevHash = '0'.repeat(64);
  for (let i = 0; i < lines.length; i++) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch (e) {
      return { valid: false, error: `Invalid JSON on line ${i + 1} of history.jsonl` };
    }

    if (entry.previous_entry_hash !== expectedPrevHash) {
      return {
        valid: false,
        error: `Hash chain broken on line ${i + 1} (${entry.task_id}): previous_entry_hash (${entry.previous_entry_hash}) does not match expected (${expectedPrevHash})`
      };
    }

    const calculatedHash = computeEntryHash(entry);
    if (entry.current_entry_hash !== calculatedHash) {
      return {
        valid: false,
        error: `Entry hash tampered on line ${i + 1} (${entry.task_id}): current_entry_hash (${entry.current_entry_hash}) != calculated (${calculatedHash})`
      };
    }

    expectedPrevHash = entry.current_entry_hash;
  }

  return { valid: true, count: lines.length, lastHash: expectedPrevHash };
}

function loadTasks() {
  if (!fs.existsSync(TASKS_PATH)) {
    throw new Error(`tasks.json not found at ${TASKS_PATH}`);
  }
  const data = JSON.parse(fs.readFileSync(TASKS_PATH, 'utf-8'));
  return data;
}

function saveTasksAtomic(data) {
  const tmpPath = TASKS_PATH + '.tmp';
  data.last_updated = new Date().toISOString();
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
  JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
  fs.renameSync(tmpPath, TASKS_PATH);
}

// Phase 1: Canonical field helpers
function normalizeTaskFiles(task) {
  const hasLegacy = Array.isArray(task.files_changed) && task.files_changed.length > 0;
  const hasCanonical = Array.isArray(task.changed_files) && task.changed_files.length > 0;

  if (hasLegacy && hasCanonical) {
    throw new Error(
      `CONFLICTING_FILE_FIELDS: Task ${task.id} has both 'files_changed' (legacy) and 'changed_files' (canonical). ` +
      `Migrate 'files_changed' contents to 'changed_files' and remove the legacy field.`
    );
  }

  const changedFiles = hasCanonical
    ? [...new Set(task.changed_files)]
    : hasLegacy
      ? [...new Set(task.files_changed)]
      : [];

  const validationFiles = Array.isArray(task.validation_files)
    ? [...new Set(task.validation_files)]
    : [];

  return { changedFiles, validationFiles, hasLegacy };
}

function validateDeclaredFilesNonEmpty(task) {
  const { changedFiles, validationFiles } = normalizeTaskFiles(task);
  const declaredFiles = [...new Set([...changedFiles, ...validationFiles])];
  if (declaredFiles.length === 0) {
    throw new Error(
      `EMPTY_DECLARED_FILES: Task ${task.id} declares no changed_files or validation_files. ` +
      `Populate at least one before checkpointing to prevent trivially-passing validation.`
    );
  }
  return { changedFiles, validationFiles, declaredFiles };
}

function buildTasksMap(tasks) {
  const seen = new Set();
  const duplicates = [];
  for (const task of tasks) {
    if (seen.has(task.id)) duplicates.push(task.id);
    seen.add(task.id);
  }
  if (duplicates.length > 0) {
    throw new Error(`Duplicate task ID(s): ${[...new Set(duplicates)].join(', ')}`);
  }
  return new Map(tasks.map(t => [t.id, t]));
}

function detectDependencyCycle(taskId, tasksMap, pathStack = [], visited = new Set()) {
  if (pathStack.includes(taskId)) {
    return [...pathStack.slice(pathStack.indexOf(taskId)), taskId];
  }
  if (visited.has(taskId)) return null;
  visited.add(taskId);

  const task = tasksMap.get(taskId);
  if (!task || !Array.isArray(task.dependencies)) return null;

  for (const depId of task.dependencies) {
    const cycle = detectDependencyCycle(depId, tasksMap, [...pathStack, taskId], visited);
    if (cycle) return cycle;
  }
  return null;
}

function evaluateTaskDependencyEligibility(task, tasksMap) {
  const dependencies = Array.isArray(task.dependencies) ? task.dependencies : [];
  const reasons = [];

  const cycle = detectDependencyCycle(task.id, tasksMap);
  if (cycle) {
    reasons.push({
      type: 'cycle',
      task_id: task.id,
      cycle
    });
  }

  for (const depId of dependencies) {
    const dep = tasksMap.get(depId);
    if (!dep) {
      reasons.push({
        type: 'missing_dependency',
        dependency_id: depId
      });
      continue;
    }
    if (dep.status !== 'completed') {
      reasons.push({
        type: 'non_completed_dependency',
        dependency_id: depId,
        status: dep.status
      });
    }
  }

  return {
    satisfied: reasons.length === 0,
    reasons,
    blocking_task_ids: [...new Set(reasons.flatMap(reason => {
      if (reason.type === 'cycle') return reason.cycle;
      return [reason.dependency_id];
    }).filter(Boolean))]
  };
}

function formatDependencyEligibilityReasons(result) {
  if (result.satisfied) return 'all dependencies completed';
  return result.reasons.map(reason => {
    if (reason.type === 'missing_dependency') {
      return `${reason.dependency_id}: missing dependency`;
    }
    if (reason.type === 'non_completed_dependency') {
      return `${reason.dependency_id}=${reason.status}`;
    }
    if (reason.type === 'cycle') {
      return `cycle: ${reason.cycle.join(' -> ')}`;
    }
    return JSON.stringify(reason);
  }).join('; ');
}

function formatDependencyEvidence(result) {
  if (result.satisfied) return 'all dependencies completed';
  return result.reasons.map(reason => {
    if (reason.type === 'missing_dependency') return `${reason.dependency_id}=missing`;
    if (reason.type === 'non_completed_dependency') return `${reason.dependency_id}=${reason.status}`;
    if (reason.type === 'cycle') return `cycle=${reason.cycle.join('->')}`;
    return JSON.stringify(reason);
  }).join('; ');
}

function getDependencyEligibility(task, tasksMap) {
  return evaluateTaskDependencyEligibility(task, tasksMap);
}

function findInvalidDependencyReason(ledger) {
  const tasksMap = buildTasksMap(ledger.tasks);
  for (const task of ledger.tasks) {
    const eligibility = getDependencyEligibility(task, tasksMap);
    const missing = eligibility.reasons.find(reason => reason.type === 'missing_dependency');
    if (missing) {
      return `Task ${task.id} references missing dependency ${missing.dependency_id}`;
    }
    const cycle = eligibility.reasons.find(reason => reason.type === 'cycle');
    if (cycle) {
      return `Task ${task.id} has dependency cycle ${cycle.cycle.join(' -> ')}`;
    }
  }
  return null;
}

function getSelectionState(ledger) {
  const tasksMap = buildTasksMap(ledger.tasks);
  const indexMap = new Map(ledger.tasks.map((t, idx) => [t.id, idx]));
  const sortByExecutionOrder = createExecutionOrderSorter(tasksMap, indexMap);

  const storedReadyTasks = ledger.tasks.filter(t => t.status === 'ready');
  const actionableReadyTasks = storedReadyTasks
    .filter(t => getDependencyEligibility(t, tasksMap).satisfied)
    .sort(sortByExecutionOrder);
  const staleReadyTasks = storedReadyTasks
    .filter(t => !getDependencyEligibility(t, tasksMap).satisfied)
    .sort((a, b) => indexMap.get(a.id) - indexMap.get(b.id));
  const eligibleValidationPendingTasks = ledger.tasks
    .filter(t => t.status === 'validation_pending')
    .filter(t => getDependencyEligibility(t, tasksMap).satisfied)
    .sort(sortByExecutionOrder);
  const awaitingPrerequisites = ledger.tasks
    .filter(t => ['not_started', 'ready', 'validation_pending'].includes(t.status))
    .filter(t => !getDependencyEligibility(t, tasksMap).satisfied)
    .sort((a, b) => indexMap.get(a.id) - indexMap.get(b.id));

  return {
    tasksMap,
    indexMap,
    storedReadyTasks,
    actionableReadyTasks,
    staleReadyTasks,
    eligibleValidationPendingTasks,
    awaitingPrerequisites
  };
}

function appendHistoryEvent(taskId, prevStatus, newStatus, reason, evidenceSummary) {
  const chainResult = validateHistoryChain();
  if (!chainResult.valid) {
    throw new Error(`Cannot append to invalid history chain: ${chainResult.error}`);
  }

  let branch = 'unknown';
  try { branch = runCmd('git branch --show-current'); } catch (e) {}
  let actor = process.env.USER || 'architecture-ledger-cli';

  const entry = {
    timestamp: new Date().toISOString(),
    task_id: taskId,
    previous_status: prevStatus,
    new_status: newStatus,
    reason: reason || 'Task status transition',
    evidence_summary: evidenceSummary || '',
    branch: branch,
    actor: actor,
    previous_entry_hash: chainResult.lastHash
  };

  entry.current_entry_hash = computeEntryHash(entry);

  const tmpHistory = HISTORY_PATH + '.tmp';
  const existingContent = fs.readFileSync(HISTORY_PATH, 'utf-8');
  fs.writeFileSync(tmpHistory, existingContent + JSON.stringify(entry) + '\n', 'utf-8');
  fs.renameSync(tmpHistory, HISTORY_PATH);

  return entry;
}

function saveReconciliationBatch(ledger, transitions) {
  const chainResult = validateHistoryChain();
  if (!chainResult.valid) {
    throw new Error(`Cannot append to invalid history chain: ${chainResult.error}`);
  }

  const timestamp = new Date().toISOString();
  let branch = 'unknown';
  try { branch = runCmd('git branch --show-current'); } catch {}
  const actor = process.env.USER || 'architecture-ledger-cli';
  let previousEntryHash = chainResult.lastHash;
  const entries = transitions.map(transition => {
    const entry = {
      timestamp,
      task_id: transition.taskId,
      previous_status: transition.previousStatus,
      new_status: transition.newStatus,
      reason: transition.reason,
      evidence_summary: transition.evidenceSummary,
      branch,
      actor,
      previous_entry_hash: previousEntryHash
    };
    entry.current_entry_hash = computeEntryHash(entry);
    previousEntryHash = entry.current_entry_hash;
    return entry;
  });

  ledger.last_updated = timestamp;
  const tasksTmp = `${TASKS_PATH}.tmp`;
  const historyTmp = `${HISTORY_PATH}.tmp`;
  try {
    fs.writeFileSync(tasksTmp, JSON.stringify(ledger, null, 2), 'utf-8');
    JSON.parse(fs.readFileSync(tasksTmp, 'utf-8'));
    fs.writeFileSync(
      historyTmp,
      fs.readFileSync(HISTORY_PATH, 'utf-8') + entries.map(entry => JSON.stringify(entry)).join('\n') + '\n',
      'utf-8'
    );
    const preparedHistory = validateHistoryChain(historyTmp);
    if (!preparedHistory.valid) {
      throw new Error(`Prepared history chain invalid: ${preparedHistory.error}`);
    }
    fs.renameSync(historyTmp, HISTORY_PATH);
    fs.renameSync(tasksTmp, TASKS_PATH);
  } catch (error) {
    for (const tmpPath of [tasksTmp, historyTmp]) {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    }
    throw error;
  }
}

function createSnapshot(reasonTag = 'transition') {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const snapPath = path.join(SNAPSHOTS_DIR, `tasks-${reasonTag}-${timestamp}.json`);
  const data = fs.readFileSync(TASKS_PATH, 'utf-8');
  fs.writeFileSync(snapPath, data, 'utf-8');
}

// Markdown Report Generator
function generateMarkdownPlan() {
  const ledger = loadTasks();
  const tasks = ledger.tasks;

  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const ready = tasks.filter(t => t.status === 'ready').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const implemented = tasks.filter(t => t.status === 'implemented').length;
  const valPending = tasks.filter(t => t.status === 'validation_pending').length;
  const validated = tasks.filter(t => t.status === 'validated').length;
  const blocked = tasks.filter(t => t.status === 'blocked').length;
  const deferred = tasks.filter(t => t.status === 'deferred').length;
  const notStarted = tasks.filter(t => t.status === 'not_started').length;
  const pct = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';
  const selection = getSelectionState(ledger);

  let branch = 'unknown';
  let commit = 'unknown';
  try { branch = runCmd('git branch --show-current'); } catch (e) {}
  try { commit = runCmd('git rev-parse --short HEAD'); } catch (e) {}

  let historyLines = [];
  if (fs.existsSync(HISTORY_PATH)) {
    historyLines = fs.readFileSync(HISTORY_PATH, 'utf-8').split('\n').filter(Boolean);
  }
  const recentHistory = historyLines.slice(-10).map(l => JSON.parse(l)).reverse();

  let out = `<!-- GENERATED FILE — DO NOT EDIT TASK STATUS MANUALLY -->
# Architecture Remediation Master Plan

> **GENERATED FILE — DO NOT EDIT TASK STATUS MANUALLY**
> Authoritative ledger files: \`docs/architecture/ledger/tasks.json\` & \`docs/architecture/ledger/history.jsonl\`

## 1. Document control

| Field | Value |
| --- | --- |
| Repository path | \`/home/shivam/Desktop/Shivam/arkn/Resources/Entitled/shopify-product-sorter\` |
| Git worktree root | \`/home/shivam/Desktop/Shivam/arkn/Resources/Entitled\` |
| Authoritative ledger | \`docs/architecture/ledger/tasks.json\` |
| Generated timestamp | \`${ledger.last_updated}\` |
| Current branch | \`${branch}\` |
| Local commit | \`${commit}\` |
| Overall status | \`${pct === '100.0' ? 'COMPLETED' : 'IN PROGRESS'}\` |

## 2. Status definitions

| Status | Meaning |
| --- | --- |
| \`not_started\` | Prerequisites or dependencies not yet satisfied. |
| \`ready\` | All dependencies satisfied and clear to begin. |
| \`in_progress\` | Work actively underway. |
| \`implemented\` | Code changes applied, validation pending. |
| \`validation_pending\` | Implementation complete, testing/validation running. |
| \`validated\` | All acceptance criteria and tests passed locally. |
| \`blocked\` | Unresolved blocking dependency or issue. |
| \`completed\` | Implementation, validation, ledger record, commit, and remote push verified. |
| \`deferred\` | Postponed to future milestone. |
| \`cancelled\` | Explicitly cancelled. |

## 3. Progress summary

| Metric | Count |
| --- | ---: |
| Total tasks | ${total} |
| Not started | ${notStarted} |
| Ready | ${ready} |
| In progress | ${inProgress} |
| Implemented | ${implemented} |
| Validation pending | ${valPending} |
| Validated | ${validated} |
| Blocked | ${blocked} |
| Deferred | ${deferred} |
| Completed | ${completed} |
| Completion percentage | ${pct}% |

## 4. Current execution focus

- Current phase: Phase 0 — Safety and recoverability.
- Next dependency-actionable ready tasks: ${selection.actionableReadyTasks.map(t => `\`${t.id}\``).slice(0, 5).join(', ') || 'None'}
- Dependency-safe validation-pending tasks: ${selection.eligibleValidationPendingTasks.map(t => `\`${t.id}\``).slice(0, 5).join(', ') || 'None'}
- Tasks awaiting prerequisites: ${selection.awaitingPrerequisites.map(t => `\`${t.id}\``).slice(0, 5).join(', ') || 'None'}
- In-progress tasks: ${tasks.filter(t => t.status === 'in_progress').map(t => `\`${t.id}\``).join(', ') || 'None'}
- Blocked tasks: ${tasks.filter(t => t.status === 'blocked').map(t => `\`${t.id}\``).join(', ') || 'None'}

## 10. Master task index

| Task ID | Title | Severity | Status | Dependencies | Notes |
| --- | --- | --- | --- | --- | --- |
`;

  for (const t of tasks) {
    const depsStr = t.dependencies.length > 0 ? t.dependencies.join(', ') : 'None';
    out += `| ${t.id} | ${t.title} | ${t.severity} | ${t.status.toUpperCase()} | ${depsStr} | ${t.notes || ''} |\n`;
  }

  out += `\n## 11. Detailed task records\n\n`;

  for (const t of tasks) {
    const depsStr = t.dependencies.length > 0 ? t.dependencies.join(', ') : 'None';
    const criteriaStr = t.acceptance_criteria.length > 0 ? t.acceptance_criteria.map(c => `- ${c}`).join('\n') : '- None specified';
    const valStr = t.validation_commands.length > 0 ? t.validation_commands.join('; ') : 'None';
    const evStr = t.evidence ? (typeof t.evidence === 'string' ? t.evidence : t.evidence.join(', ')) : 'Not completed.';

    out += `### \`${t.id}\` ${t.title}

**Severity:** ${t.severity}  
**Status:** ${t.status.toUpperCase()}  
**Dependencies:** ${depsStr}  
**Last updated:** ${t.updated_timestamp}  

#### Description

${t.description}

#### Acceptance criteria

${criteriaStr}

#### Validation commands

\`\`\`bash
${valStr}
\`\`\`

#### Completion evidence

${evStr}

---

`;
  }

  out += `## 12. Recent ledger history

| Timestamp | Task ID | Prev Status | New Status | Actor | Reason | Hash |
| --- | --- | --- | --- | --- | --- | --- |
`;

  for (const h of recentHistory) {
    const shortHash = h.current_entry_hash ? h.current_entry_hash.slice(0, 8) : 'n/a';
    out += `| ${h.timestamp} | ${h.task_id} | ${h.previous_status} | ${h.new_status} | ${h.actor} | ${h.reason} | \`${shortHash}\` |\n`;
  }

  return out.split('\n').map(line => line.trimEnd()).join('\n');
}

// Obsidian Sync
function syncObsidianMemory() {
  const ledger = loadTasks();
  const tasks = ledger.tasks;
  const ready = tasks.filter(t => t.status === 'ready');
  const inProgress = tasks.filter(t => t.status === 'in_progress');
  const blocked = tasks.filter(t => t.status === 'blocked');
  const completed = tasks.filter(t => t.status === 'completed');

  let content = `<!-- Generated from the repository architecture ledger. Do not edit task statuses manually. -->
# Pending Work & Architecture Execution Focus

*Last synced: ${new Date().toISOString()}*

## Current In-Progress Tasks
${inProgress.length > 0 ? inProgress.map(t => `- **${t.id}**: ${t.title}`).join('\n') : '- None'}

## Next Ready Tasks
${ready.length > 0 ? ready.map(t => `- **${t.id}**: ${t.title} (Severity: ${t.severity})`).join('\n') : '- None'}

## Blocked Tasks
${blocked.length > 0 ? blocked.map(t => `- **${t.id}**: ${t.title} — Reasons: ${t.blocking_reasons.join('; ')}`).join('\n') : '- None'}

## Completed Tasks (${completed.length}/${tasks.length})
${completed.map(t => `- [x] **${t.id}**: ${t.title}`).join('\n')}
`;

  try {
    const dir = path.dirname(OBSIDIAN_PENDING_PATH);
    if (fs.existsSync(dir)) {
      fs.writeFileSync(OBSIDIAN_PENDING_PATH, content, 'utf-8');
      return { success: true, path: OBSIDIAN_PENDING_PATH };
    } else {
      return { success: false, reason: `Obsidian directory ${dir} does not exist` };
    }
  } catch (err) {
    return { success: false, reason: err.message };
  }
}


// Reconciliation & Next Task Selection
function reconcileReadiness() {
  return withLock(() => {
    const ledger = loadTasks();
    const promotedTaskIds = [];
    const demotedTasks = [];
    const tasksMap = buildTasksMap(ledger.tasks);

    for (const task of ledger.tasks) {
      const missing = getDependencyEligibility(task, tasksMap).reasons.find(reason => reason.type === 'missing_dependency');
      if (missing) {
        throw new Error(`Cannot reconcile readiness: task ${task.id} references non-existent dependency ${missing.dependency_id}`);
      }
    }

    const staleReadyTasks = ledger.tasks.filter(task => {
      if (task.status !== 'ready') return false;
      return !getDependencyEligibility(task, tasksMap).satisfied;
    });

    const staleCycle = staleReadyTasks
      .map(task => getDependencyEligibility(task, tasksMap).reasons.find(reason => reason.type === 'cycle'))
      .find(Boolean);
    if (staleCycle) {
      throw new Error(`Cannot reconcile readiness: dependency cycle detected (${staleCycle.cycle.join(' -> ')})`);
    }

    const staleIds = staleReadyTasks.map(task => task.id);
    if (new Set(staleIds).size !== staleIds.length) {
      throw new Error(`Duplicate stale-ready task ID(s): ${staleIds.join(', ')}`);
    }

    const transitions = [];
    const now = new Date().toISOString();
    for (const task of staleReadyTasks) {
      const eligibility = getDependencyEligibility(task, tasksMap);
      const prevStatus = task.status;
      task.status = 'not_started';
      task.updated_timestamp = now;

      transitions.push({
        taskId: task.id,
        previousStatus: prevStatus,
        newStatus: 'not_started',
        reason: 'Phase 4.1 readiness reconciliation: Phase 3B exposed stale ready status with unmet dependencies',
        evidenceSummary: `Unmet dependencies: ${formatDependencyEvidence(eligibility)}`
      });

      demotedTasks.push({
        id: task.id,
        reason: formatDependencyEvidence(eligibility)
      });
    }

    let promotedInPass = 0;
    do {
      promotedInPass = 0;
      const currentTasksMap = buildTasksMap(ledger.tasks);
      for (const task of ledger.tasks) {
        if (task.status === 'not_started') {
          const hasBlockers = Array.isArray(task.blocking_reasons) && task.blocking_reasons.length > 0;
          if (hasBlockers) continue;

          const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
          const eligibility = getDependencyEligibility(task, currentTasksMap);

          if (eligibility.satisfied) {
            const prevStatus = task.status;
            task.status = 'ready';
            task.updated_timestamp = now;

            transitions.push({
              taskId: task.id,
              previousStatus: prevStatus,
              newStatus: 'ready',
              reason: 'Automatic readiness reconciliation: all dependencies completed',
              evidenceSummary: `Dependencies completed: ${deps.join(', ') || 'None'}`
            });

            promotedTaskIds.push(task.id);
            promotedInPass++;
          }
        }
      }
    } while (promotedInPass > 0);

    if (transitions.length > 0) saveReconciliationBatch(ledger, transitions);

    const historyCheck = validateHistoryChain();
    if (!historyCheck.valid) {
      throw new Error(`History chain invalid after readiness reconciliation: ${historyCheck.error}`);
    }

    return { promotedTaskIds, demotedTasks };
  });
}

const SEVERITY_WEIGHT = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1
};

function isDependencyOf(ancestorId, targetId, tasksMap, visited = new Set()) {
  if (ancestorId === targetId) return false;
  const target = tasksMap.get(targetId);
  if (!target || !Array.isArray(target.dependencies) || target.dependencies.length === 0) {
    return false;
  }
  if (target.dependencies.includes(ancestorId)) {
    return true;
  }
  for (const depId of target.dependencies) {
    if (!visited.has(depId)) {
      visited.add(depId);
      if (isDependencyOf(ancestorId, depId, tasksMap, visited)) {
        return true;
      }
    }
  }
  return false;
}

function createExecutionOrderSorter(tasksMap, indexMap) {
  return (a, b) => {
    // 1. Dependency / Topological order: ancestor comes first
    if (isDependencyOf(a.id, b.id, tasksMap)) return -1;
    if (isDependencyOf(b.id, a.id, tasksMap)) return 1;

    // 2. Architecture phase / order from ledger (index in tasks.json)
    const idxA = indexMap.get(a.id);
    const idxB = indexMap.get(b.id);
    if (idxA !== idxB) return idxA - idxB;

    // 3. Severity
    const sevA = SEVERITY_WEIGHT[a.severity] || 0;
    const sevB = SEVERITY_WEIGHT[b.severity] || 0;
    if (sevA !== sevB) return sevB - sevA;

    // 4. Task ID tie-breaker
    return a.id.localeCompare(b.id);
  };
}

function selectNextTask(ledger) {
  const {
    tasksMap,
    indexMap,
    storedReadyTasks,
    actionableReadyTasks,
    staleReadyTasks,
    eligibleValidationPendingTasks,
    awaitingPrerequisites
  } = getSelectionState(ledger);
  const sortValidationFirst = (a, b) => {
    const idxA = indexMap.get(a.id);
    const idxB = indexMap.get(b.id);
    if (idxA !== idxB) return idxA - idxB;
    return a.id.localeCompare(b.id);
  };
  eligibleValidationPendingTasks.sort(sortValidationFirst);

  let nextTask = null;
  let recommendationType = 'none';
  let reason = '';

  if (actionableReadyTasks.length > 0) {
    nextTask = actionableReadyTasks[0];
    recommendationType = 'actionable_ready';
    const idx = indexMap.get(nextTask.id);
    reason = `Selected ${nextTask.id} because status is ready, dependencies are completed, and it ranks highest by topological/phase order (ledger index ${idx}, severity ${nextTask.severity}).`;
  } else if (eligibleValidationPendingTasks.length > 0) {
    nextTask = eligibleValidationPendingTasks[0];
    recommendationType = 'validation_pending';
    const idx = indexMap.get(nextTask.id);
    reason = `Selected ${nextTask.id} for re-validation because no dependency-actionable ready implementation tasks exist, its dependencies are completed, and it ranks earliest by topological/phase order (ledger index ${idx}, severity ${nextTask.severity}).`;
  } else {
    reason = 'No dependency-actionable ready tasks or dependency-safe validation-pending tasks found.';
  }

  return {
    nextTask,
    reason,
    readyTasks: actionableReadyTasks,
    storedReadyTasks,
    staleReadyTasks,
    eligibleValidationPendingTasks,
    awaitingPrerequisites,
    recommendationType,
    tasksMap
  };
}

function cmdReconcile() {
  const { promotedTaskIds, demotedTasks } = reconcileReadiness();
  if (demotedTasks.length > 0) {
    const details = demotedTasks.map(task => `${task.id} (${task.reason})`).join(', ');
    console.log(`✓ Reconciled ${demotedTasks.length} stale-ready task(s) to 'not_started': ${details}`);
  }
  if (promotedTaskIds.length > 0) {
    console.log(`✓ Reconciled ${promotedTaskIds.length} task(s) to 'ready': ${promotedTaskIds.join(', ')}`);
  }
  if (promotedTaskIds.length === 0 && demotedTasks.length === 0) {
    console.log('✓ No tasks needed readiness reconciliation.');
  }
}

function printIneligibleTasks(label, tasks, tasksMap) {
  if (tasks.length === 0) return;
  console.log(`\n${label} (${tasks.length}):`);
  tasks.forEach(t => {
    const eligibility = getDependencyEligibility(t, tasksMap);
    console.log(` - ${t.id} [${t.status}]: ${formatDependencyEligibilityReasons(eligibility)}`);
  });
}

function printEligibleTasks(label, tasks) {
  console.log(`\n${label} (${tasks.length}):`);
  if (tasks.length === 0) {
    console.log(' - None');
  } else {
    tasks.forEach(t => console.log(` - ${t.id} [${t.severity}]: ${t.title}`));
  }
}

function cmdNext() {
  reconcileReadiness();
  const ledger = loadTasks();
  const {
    nextTask,
    reason,
    readyTasks,
    staleReadyTasks,
    eligibleValidationPendingTasks,
    awaitingPrerequisites,
    recommendationType,
    tasksMap
  } = selectNextTask(ledger);

  console.log('=== Architecture Ledger Recommended Next Task ===');
  if (!nextTask) {
    console.log('No dependency-actionable ready task or dependency-safe validation-pending task found.');
    printIneligibleTasks('Tasks awaiting prerequisites', awaitingPrerequisites, tasksMap);
    return;
  }

  console.log(`Recommended Next:  ${nextTask.id} — ${nextTask.title}`);
  console.log(`Severity:          ${nextTask.severity}`);
  console.log(`Status:            ${nextTask.status}`);
  console.log(`Dependencies:      ${nextTask.dependencies.join(', ') || 'None'}`);
  console.log(`Recommendation:    ${recommendationType}`);
  console.log(`Selection Reason:  ${reason}`);
  printEligibleTasks('Dependency-Actionable Ready Tasks', readyTasks);
  printEligibleTasks('Dependency-Safe Validation-Pending Tasks', eligibleValidationPendingTasks);
  printIneligibleTasks('Stale/Ineligible Ready Tasks', staleReadyTasks, tasksMap);
  printIneligibleTasks('Tasks Awaiting Prerequisites', awaitingPrerequisites, tasksMap);
}

// CLI Subcommands implementation
function cmdDoctor() {
  reconcileReadiness();
  console.log('=== Architecture Ledger Doctor ===');
  let errors = [];

  if (!fs.existsSync(TASKS_PATH)) errors.push(`Missing ${TASKS_PATH}`);
  if (!fs.existsSync(HISTORY_PATH)) errors.push(`Missing ${HISTORY_PATH}`);
  if (!fs.existsSync(SCHEMA_PATH)) errors.push(`Missing ${SCHEMA_PATH}`);

  const historyCheck = validateHistoryChain();
  if (!historyCheck.valid) {
    errors.push(`History chain error: ${historyCheck.error}`);
  } else {
    console.log(`✓ History chain intact (${historyCheck.count} events)`);
  }

  try {
    const ledger = loadTasks();
    const ids = new Set();
    for (const t of ledger.tasks) {
      if (ids.has(t.id)) errors.push(`Duplicate task ID: ${t.id}`);
      ids.add(t.id);
      if (!ALLOWED_STATES.includes(t.status)) {
        errors.push(`Invalid status '${t.status}' for task ${t.id}`);
      }
    }
    console.log(`✓ Validated ${ledger.tasks.length} tasks in ledger`);
  } catch (err) {
    errors.push(`Task ledger read error: ${err.message}`);
  }

  try {
    if (fs.existsSync(PLAN_MARKDOWN_PATH)) {
      const currentMd = fs.readFileSync(PLAN_MARKDOWN_PATH, 'utf-8');
      const expectedMd = generateMarkdownPlan();
      const cleanCurrent = currentMd.replace(/Generated timestamp \| `.*?`/g, 'TIMESTAMP').replace(/Local commit \| `.*?`/g, 'COMMIT');
      const cleanExpected = expectedMd.replace(/Generated timestamp \| `.*?`/g, 'TIMESTAMP').replace(/Local commit \| `.*?`/g, 'COMMIT');
      if (cleanCurrent !== cleanExpected) {
        console.log('⚠ Warning: Markdown plan file has drift compared to ledger generation');
      } else {
        console.log('✓ Generated Markdown plan is in sync');
      }
    }
  } catch (err) {
    errors.push(`Markdown drift check error: ${err.message}`);
  }

  if (errors.length > 0) {
    console.error('\nDoctor found issues:');
    errors.forEach(e => console.error(` - ${e}`));
    process.exit(1);
  } else {
    console.log('\n✓ Architecture ledger system is healthy.');
  }
}

function cmdStatus() {
  reconcileReadiness();
  const ledger = loadTasks();
  const tasks = ledger.tasks;
  const historyCheck = validateHistoryChain();

  const counts = {};
  ALLOWED_STATES.forEach(s => counts[s] = 0);
  tasks.forEach(t => counts[t.status] = (counts[t.status] || 0) + 1);

  console.log('=== Architecture Ledger Status ===');
  console.log(`Total Tasks:        ${tasks.length}`);
  console.log(`Completed:          ${counts.completed}`);
  console.log(`Validated:          ${counts.validated}`);
  console.log(`Validation Pending: ${counts.validation_pending}`);
  console.log(`Implemented:        ${counts.implemented}`);
  console.log(`In Progress:        ${counts.in_progress}`);
  console.log(`Ready:              ${counts.ready}`);
  console.log(`Blocked:            ${counts.blocked}`);
  console.log(`Not Started:        ${counts.not_started}`);
  console.log(`Deferred:           ${counts.deferred}`);
  console.log(`Cancelled:          ${counts.cancelled}`);
  console.log(`History Events:     ${historyCheck.valid ? historyCheck.count : 'CORRUPTED'}`);
}

function cmdResume() {
  reconcileReadiness();
  let root = REPO_ROOT;
  let branch = 'unknown';
  let localSha = 'unknown';
  let remoteSha = 'unknown';
  let match = false;
  let statusOutput = '';

  try { branch = runCmd('git branch --show-current'); } catch (e) {}
  try { localSha = runCmd('git rev-parse HEAD'); } catch (e) {}
  try { remoteSha = runCmd(`git rev-parse origin/${branch}`, { allowError: true }); } catch (e) {}
  match = (localSha === remoteSha);
  try { statusOutput = runCmd('git status --short'); } catch (e) {}

  const historyCheck = validateHistoryChain();
  let ledger;
  let ledgerValid = true;
  try { ledger = loadTasks(); } catch (e) { ledgerValid = false; }

  let inProgress = ledgerValid ? ledger.tasks.filter(t => t.status === 'in_progress') : [];
  let ready = ledgerValid ? ledger.tasks.filter(t => t.status === 'ready') : [];
  let blocked = ledgerValid ? ledger.tasks.filter(t => t.status === 'blocked') : [];
  let completed = ledgerValid ? ledger.tasks.filter(t => t.status === 'completed') : [];

  let mdSync = 'IN SYNC';
  if (fs.existsSync(PLAN_MARKDOWN_PATH) && ledgerValid) {
    const currentMd = fs.readFileSync(PLAN_MARKDOWN_PATH, 'utf-8');
    const expectedMd = generateMarkdownPlan();
    const cleanCurrent = currentMd.replace(/Generated timestamp \| `.*?`/g, 'TIMESTAMP').replace(/Local commit \| `.*?`/g, 'COMMIT');
      const cleanExpected = expectedMd.replace(/Generated timestamp \| `.*?`/g, 'TIMESTAMP').replace(/Local commit \| `.*?`/g, 'COMMIT');
    if (cleanCurrent !== cleanExpected) {
      mdSync = 'DRIFT DETECTED';
    }
  }

  let unpushedCommits = '';
  try {
    unpushedCommits = runCmd(`git log origin/${branch}..HEAD --oneline`, { allowError: true });
  } catch (e) {}

  console.log('=== Architecture Session Resume ===');
  console.log(`Repository Root:   ${root}`);
  console.log(`Current Branch:    ${branch}`);
  console.log(`Local SHA:         ${localSha}`);
  console.log(`Remote SHA:        ${remoteSha}`);
  console.log(`SHA Match:         ${match ? 'YES' : 'NO / UNPUSHED COMMITS'}`);
  console.log(`Working Tree:      ${statusOutput.length > 0 ? 'DIRTY' : 'CLEAN'}`);
  console.log(`Ledger Validity:   ${ledgerValid ? 'VALID' : 'INVALID'}`);
  console.log(`History Chain:     ${historyCheck.valid ? 'VALID' : 'BROKEN'}`);
  console.log(`Markdown Sync:     ${mdSync}`);
  console.log(`In-Progress Task:  ${inProgress.length > 0 ? inProgress.map(t => t.id).join(', ') : 'None'}`);
  const {
    nextTask,
    reason,
    readyTasks,
    staleReadyTasks,
    eligibleValidationPendingTasks,
    awaitingPrerequisites,
    recommendationType,
    tasksMap
  } = selectNextTask(ledger);
  console.log(`Stored Ready Tasks: ${ready.map(t => t.id).slice(0, 5).join(', ') || 'None'} (Total: ${ready.length})`);
  console.log(`Actionable Ready:  ${readyTasks.map(t => t.id).slice(0, 5).join(', ') || 'None'} (Total: ${readyTasks.length})`);
  console.log(`Validation-Ready:  ${eligibleValidationPendingTasks.map(t => t.id).slice(0, 5).join(', ') || 'None'} (Total: ${eligibleValidationPendingTasks.length})`);
  console.log(`Recommended Next:  ${nextTask ? nextTask.id : 'None'}`);
  console.log(`Recommendation:    ${recommendationType}`);
  if (nextTask) {
    console.log(`Selection Reason:  ${reason}`);
  }
  printIneligibleTasks('Stale/Ineligible Ready Tasks', staleReadyTasks, tasksMap);
  printIneligibleTasks('Tasks Awaiting Prerequisites', awaitingPrerequisites, tasksMap);
  console.log(`Blocked Tasks:     ${blocked.map(t => t.id).join(', ') || 'None'}`);
  console.log(`Last Completed:    ${completed.slice(-3).map(t => t.id).join(', ') || 'None'}`);
  console.log(`Unpushed Commits:  ${unpushedCommits ? '\n' + unpushedCommits : 'None'}`);
}

function cmdShow(taskId) {
  if (!taskId) throw new Error('Task ID required for show');
  const ledger = loadTasks();
  const task = ledger.tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  console.log(JSON.stringify(task, null, 2));
}

function cmdTransition(taskId, targetStatus, reason, evidence) {
  if (!taskId) throw new Error('Task ID required');
  if (!ALLOWED_STATES.includes(targetStatus)) throw new Error(`Invalid status ${targetStatus}`);

  return withLock(() => {
    const ledger = loadTasks();
    const task = ledger.tasks.find(t => t.id === taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);

    const prevStatus = task.status;

    // Validate dependencies for starting or completing
    if (['in_progress', 'implemented', 'validated', 'completed'].includes(targetStatus)) {
      const eligibility = getDependencyEligibility(task, buildTasksMap(ledger.tasks));
      if (!eligibility.satisfied) {
        throw new Error(`Cannot transition ${taskId} to ${targetStatus}: Dependencies not completed (${formatDependencyEligibilityReasons(eligibility)})`);
      }
    }

    if (!evidence && reason) {
      evidence = reason;
    }

    // Require task to be validated before completed
    if (targetStatus === 'completed' && prevStatus !== 'validated' && prevStatus !== 'completed') {
      throw new Error(`Cannot complete task ${taskId}: task must be in 'validated' status before completion (current: '${prevStatus}')`);
    }

    // Require evidence for completion
    const hasEvidence = Boolean(evidence) || Boolean(task.evidence && (Array.isArray(task.evidence) ? task.evidence.length > 0 : task.evidence.trim().length > 0));
    if (targetStatus === 'completed' && !hasEvidence) {
      throw new Error(`Evidence required to complete task ${taskId}`);
    }

    const now = new Date().toISOString();
    task.status = targetStatus;
    task.updated_timestamp = now;

    if (targetStatus === 'in_progress') task.started_timestamp = now;
    if (targetStatus === 'implemented') task.implemented_timestamp = now;
    if (targetStatus === 'validated') task.validated_timestamp = now;
    if (targetStatus === 'completed') task.completed_timestamp = now;

    if (evidence) {
      if (Array.isArray(task.evidence)) {
        task.evidence.push(evidence);
      } else if (task.evidence) {
        task.evidence = [task.evidence, evidence];
      } else {
        task.evidence = evidence;
      }
    }

    saveTasksAtomic(ledger);
    appendHistoryEvent(taskId, prevStatus, targetStatus, reason || `Transition to ${targetStatus}`, evidence || '');

    // Regenerate markdown plan
    const md = generateMarkdownPlan();
    fs.writeFileSync(PLAN_MARKDOWN_PATH, md, 'utf-8');

    // Create snapshot if significant transition
    if (['completed', 'blocked', 'deferred'].includes(targetStatus)) {
      createSnapshot(targetStatus);
    }

    // Sync obsidian memory
    syncObsidianMemory();

    if (targetStatus === 'completed') {
      reconcileReadiness();
    }

    console.log(`✓ Task ${taskId} transitioned: ${prevStatus} -> ${targetStatus}`);
  });
}

function cmdGenerate() {
  reconcileReadiness();
  const md = generateMarkdownPlan();
  fs.writeFileSync(PLAN_MARKDOWN_PATH, md, 'utf-8');
  console.log(`✓ Generated ${PLAN_MARKDOWN_PATH}`);
}

function cmdValidate() {
  reconcileReadiness();
  const historyCheck = validateHistoryChain();
  if (!historyCheck.valid) {
    console.error(`✕ History chain invalid: ${historyCheck.error}`);
    process.exit(1);
  }

  const ledger = loadTasks();
  let tasksMap;
  try {
    tasksMap = buildTasksMap(ledger.tasks);
  } catch (err) {
    console.error(`✕ ${err.message}`);
    process.exit(1);
  }

  for (const t of ledger.tasks) {
    for (const dep of t.dependencies) {
      if (!tasksMap.has(dep)) {
        console.error(`✕ Task ${t.id} references non-existent dependency ${dep}`);
        process.exit(1);
      }
    }

    getDependencyEligibility(t, tasksMap);
  }

  if (fs.existsSync(PLAN_MARKDOWN_PATH)) {
    const currentMd = fs.readFileSync(PLAN_MARKDOWN_PATH, 'utf-8');
    const expectedMd = generateMarkdownPlan();
    const cleanCurrent = currentMd.replace(/Generated timestamp \| `.*?`/g, 'TIMESTAMP').replace(/Local commit \| `.*?`/g, 'COMMIT');
      const cleanExpected = expectedMd.replace(/Generated timestamp \| `.*?`/g, 'TIMESTAMP').replace(/Local commit \| `.*?`/g, 'COMMIT');
    if (cleanCurrent !== cleanExpected) {
      console.error('✕ Markdown plan drift detected! Run `npm run arch:generate` to sync.');
      process.exit(1);
    }
  }

  console.log('✓ All ledger validations passed.');
}

function cmdCheckpoint(taskId) {
  reconcileReadiness();
  if (!taskId) throw new Error("Task ID required for checkpoint");

  const ledger = loadTasks();
  const task = ledger.tasks.find(t => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);

  const branch = runCmd("git branch --show-current", { allowError: true }) || "main";

  // 0. Require task to be in validated or completed status (check first, before file validation)
  if (!["validated", "completed"].includes(task.status)) {
    throw new Error(`Task ${taskId} must be in validated or completed status before checkpoint (current: ${task.status})`);
  }

  // 1. Canonical file field resolution (Phase 1: reject conflicts, prevent empty bypass)
  const { changedFiles, validationFiles, declaredFiles } = validateDeclaredFilesNonEmpty(task);

  console.log(`=== Checkpointing Task ${taskId} ===`);

  let prefix = "";
  try {
    prefix = runCmd("git rev-parse --show-prefix", { allowError: true });
  } catch (e) {}

  // 2. Confirm every declared file is tracked and exists in Git / HEAD / working tree
  for (const file of declaredFiles) {
    const absFile = path.join(REPO_ROOT, file);
    if (!fs.existsSync(absFile)) {
      throw new Error(`MISSING_DECLARED_FILE: Declared file ${file} does not exist on disk.`);
    }

    try {
      runCmd(`git ls-files --error-unmatch "${file}"`);
    } catch (e) {
      throw new Error(`UNTRACKED_DECLARED_FILE: Declared file ${file} is untracked by Git.`);
    }

    const gitPath = prefix + file;
    try {
      runCmd(`git cat-file -e "HEAD:${gitPath}"`);
    } catch (e) {
      const status = runCmd(`git status --porcelain "${file}"`, { allowError: true });
      if (!status) {
        throw new Error(`FILE_ABSENT_FROM_HEAD: Declared file ${file} is absent from HEAD and not staged.`);
      }
    }
  }

  // 3. Reject relevant untracked implementation or test files
  const statusShort = runCmd("git status --short -uall", { allowError: true });
  const untrackedLines = statusShort.split("\n")
    .filter(line => line.startsWith("??"))
    .map(line => line.slice(3).trim());

  const untrackedImplFiles = untrackedLines.filter(file => {
    if (file.includes(".tokensave") || file.includes("graphify-out") || file.includes("test-results") || file.endsWith(".db") || file.startsWith(".tmp-")) {
      return false;
    }
    return /\.(js|jsx|ts|tsx|json|sql|sh|mjs|cjs|py|css|html)$/i.test(file);
  });

  if (untrackedImplFiles.length > 0) {
    throw new Error(`UNTRACKED_IMPLEMENTATION_FILE: Untracked implementation or test files detected: ${untrackedImplFiles.join(", ")}. Stage or remove them before checkpointing.`);
  }

  // Check for secrets in dirty files
  const dirtyFiles = statusShort.split("\n").filter(Boolean).map(line => line.slice(3).trim());
  const secretPattern = /(AKIA[0-9A-Z]{16}|ghp_[0-9a-zA-Z]{36}|sk_[live|test]_[0-9a-zA-Z]{24,}|-----BEGIN PRIVATE KEY-----)/i;
  for (const file of dirtyFiles) {
    const fullPath = path.join(REPO_ROOT, file);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      const fileContent = fs.readFileSync(fullPath, "utf-8");
      if (secretPattern.test(fileContent)) {
        throw new Error(`CRITICAL: Potential secret detected in file ${file}! Aborting checkpoint.`);
      }
    }
  }

  cmdValidate();
  cmdGenerate();

  // 4. Stage and commit implementation & validation files
  for (const file of declaredFiles) {
    if (fs.existsSync(path.join(REPO_ROOT, file))) {
      runCmd(`git add "${file}"`);
    }
  }

  const commitMsg = `arch(${taskId}): ${task.title}`;
  try {
    runCmd(`git commit -m "${commitMsg}"`);
    console.log(`\u2713 Committed implementation: ${commitMsg}`);
  } catch (e) {
    console.log("Notice: No new implementation changes to commit.");
  }

  // 5. Record implementation_commit_sha (Phase 1)
  const implementationCommitSha = runCmd("git rev-parse HEAD");
  task.implementation_commit_sha = implementationCommitSha;

  // Push implementation commit
  let pushSuccess = false;
  try {
    runCmd(`git push origin ${branch}`);
    pushSuccess = true;
  } catch (e) {
    console.error(`\u2717 Failed to push branch ${branch} to origin: ${e.message}`);
  }

  if (!pushSuccess) {
    console.warn(`\u26a0 Checkpoint push failed. Task ${taskId} remains in status validated (unpushed checkpoint).`);
    throw new Error(`PUSH_FAILED: Failed to push implementation commit ${implementationCommitSha} to origin/${branch}`);
  }

  // 6. Verify remote SHA matches implementation commit
  const remoteImplSha = runCmd(`git rev-parse origin/${branch}`);
  if (implementationCommitSha !== remoteImplSha) {
    throw new Error(`REMOTE_SHA_MISMATCH: Local SHA (${implementationCommitSha}) != Remote SHA (${remoteImplSha}). Task remains uncompleted.`);
  }

  // 7. Run required validation from a clean detached worktree at implementationCommitSha
  console.log(`\n=== Running Clean Detached-Worktree Validation at ${implementationCommitSha} ===`);
  const verifyRoot = runCmd("mktemp -d /tmp/entitled-checkpoint-verify-XXXXXX");
  let cleanValidationPassed = false;
  let validationResults = { regression_gate: { passed: false }, verify: { passed: false } };

  try {
    const repoTop = runCmd("git rev-parse --show-toplevel");
    runCmd(`git -C "${repoTop}" worktree add --detach "${verifyRoot}" ${implementationCommitSha}`);

    const appDir = path.join(verifyRoot, "shopify-product-sorter");
    const targetDir = fs.existsSync(appDir) ? appDir : verifyRoot;

    // Phase 1: npm ci in detached worktree before running tests
    console.log("Running npm ci in clean worktree...");
    try {
      runCmd("npm ci", { cwd: targetDir });
      console.log("\u2713 npm ci succeeded in clean worktree");
    } catch (e) {
      throw new Error(`npm ci failed in clean worktree: ${e.message}`);
    }

    // Run regression gate using actual exit code (Phase 1: no string matching)
    console.log("Running regression gate in clean worktree...");
    let regExitCode = 1;
    let regOutput = "";
    try {
      regOutput = runCmd("npm run test:regression-gate", { cwd: targetDir });
      regExitCode = 0;
    } catch (e) {
      regOutput = (e.stdout || "") + (e.stderr || "");
      regExitCode = e.status || 1;
    }

    validationResults.regression_gate = {
      passed: regExitCode === 0,
      exit_code: regExitCode,
      output_summary: regOutput.split("\n").filter(l => l.includes("Overall Status:") || l.includes("Suites")).join(" | ")
    };

    // Run verify using actual exit code (Phase 1: no string matching)
    let verifyExitCode = 1;
    let verifyOutput = "";
    try {
      verifyOutput = runCmd("npm run verify", { cwd: targetDir });
      verifyExitCode = 0;
    } catch (e) {
      verifyOutput = (e.stdout || "") + (e.stderr || "");
      verifyExitCode = e.status || 1;
    }

    validationResults.verify = {
      passed: verifyExitCode === 0,
      exit_code: verifyExitCode,
      output_summary: verifyOutput.split("\n").filter(l => l.includes("verification")).join(" | ")
    };

    if (regExitCode !== 0) {
      throw new Error(`Clean regression-gate failed (exit ${regExitCode}):\n${regOutput}`);
    }
    if (verifyExitCode !== 0) {
      throw new Error(`Clean verify failed (exit ${verifyExitCode}):\n${verifyOutput}`);
    }

    cleanValidationPassed = true;
    console.log(`\u2713 Clean detached-worktree validation PASSED at ${implementationCommitSha}`);
  } catch (err) {
    console.error(`\u2717 Clean committed-state validation FAILED: ${err.message}`);
    cleanValidationPassed = false;
  } finally {
    try {
      const repoTop = runCmd("git rev-parse --show-toplevel");
      runCmd(`git -C "${repoTop}" worktree remove --force "${verifyRoot}"`, { allowError: true });
    } catch (e) {}
  }

  // 8. Record clean_validation_commit_sha (Phase 1: set regardless of pass/fail for audit trail)
  task.clean_validation_commit_sha = cleanValidationPassed ? implementationCommitSha : null;
  task.validation_results = {
    ...validationResults,
    timestamp: new Date().toISOString(),
    implementation_commit_sha: implementationCommitSha,
    clean_validation_commit_sha: cleanValidationPassed ? implementationCommitSha : null,
    tested_commit: cleanValidationPassed ? implementationCommitSha : null,
    passed: cleanValidationPassed
  };

  if (!cleanValidationPassed) {
    saveTasksAtomic(ledger);
    cmdTransition(taskId, "validation_pending", "Clean committed-state validation failed", `Attempted SHA: ${implementationCommitSha}`);
    throw new Error(`CLEAN_VALIDATION_FAILED: Clean committed-state validation failed at SHA ${implementationCommitSha}. Task moved to validation_pending.`);
  }

  // 9. Transition to completed, append history, regenerate Markdown, commit completion record & push
  cmdTransition(taskId, "completed", "Clean committed-state verification passed", `Tested SHA: ${implementationCommitSha}`);

  runCmd(`git add "${LEDGER_DIR}" "${PLAN_MARKDOWN_PATH}"`);
  const completionMsg = `docs(${taskId}): complete task and record evidence`;
  try {
    runCmd(`git commit -m "${completionMsg}"`);
  } catch (e) {}

  runCmd(`git push origin ${branch}`);

  // 10. Record completion_record_commit_sha (Phase 1)
  const completionRecordSha = runCmd("git rev-parse HEAD");
  task.completion_record_commit_sha = completionRecordSha;
  saveTasksAtomic(ledger);

  // Final sync: re-add and re-commit the SHA update if it changed
  runCmd(`git add "${LEDGER_DIR}"`);
  try {
    runCmd(`git commit -m "docs(${taskId}): record completion_record_commit_sha"`);
    runCmd(`git push origin ${branch}`);
  } catch (e) {}

  const remoteCompletionSha = runCmd(`git rev-parse origin/${branch}`);
  const finalCompletionSha = runCmd("git rev-parse HEAD");

  if (finalCompletionSha !== remoteCompletionSha) {
    throw new Error(`SHA mismatch on completion record! Local (${finalCompletionSha}) != Remote (${remoteCompletionSha})`);
  }

  console.log(`\n==============================================`);
  console.log(`COMMITTED-STATE VALIDATION: PASS`);
  console.log(`Tested implementation SHA: ${implementationCommitSha}`);
  console.log(`Completion-record SHA:     ${finalCompletionSha}`);
  console.log(`Remote SHA match:          YES`);
  console.log(`==============================================\n`);
}

function cmdAuditCompleted() {
  const ledger = loadTasks();
  const historyLines = fs.existsSync(HISTORY_PATH)
    ? fs.readFileSync(HISTORY_PATH, 'utf-8').split('\n').filter(Boolean)
    : [];
  const historyEntries = historyLines.map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);

  // Build tasks map for dependency lookups
  const tasksMap = buildTasksMap(ledger.tasks);
  const ledgerSha = runCmd('git rev-parse HEAD', { allowError: true }) || 'unknown';

  const completedTasks = ledger.tasks.filter(t => t.status === 'completed');

  // Phase 1 fields that indicate modern completion
  const PHASE1_FIELDS = ['implementation_commit_sha', 'clean_validation_commit_sha', 'completion_record_commit_sha', 'validation_results'];

  function hasPhase1Metadata(task) {
    return PHASE1_FIELDS.some(f => task[f] != null && task[f] !== undefined);
  }

  function isCommitSha(sha) {
    return typeof sha === 'string' && /^[0-9a-f]{40}$/i.test(sha);
  }

  function shaExistsLocally(sha) {
    if (!isCommitSha(sha)) return false;
    try {
      runCmd(`git cat-file -e "${sha}^{commit}"`);
      return true;
    } catch {
      return false;
    }
  }

  function shaExistsOnOrigin(sha) {
    if (!isCommitSha(sha)) return false;
    try {
      const output = runCmd(`git branch -r --contains "${sha}"`);
      // Command can succeed with empty output; require at least one remote ref
      const refs = output.split('\n').map(r => r.trim()).filter(Boolean);
      if (refs.length === 0) return false;
      // Prefer the architecture branch itself
      return refs.some(r => r.includes('origin/ops/architecture-ledger-hardening')) || refs.length > 0;
    } catch {
      return false;
    }
  }

  function shaIsAncestor(ancestorSha, descendantSha) {
    if (!shaExistsLocally(ancestorSha) || !shaExistsLocally(descendantSha)) return false;
    try {
      runCmd(`git merge-base --is-ancestor "${ancestorSha}" "${descendantSha}"`);
      return true;
    } catch {
      return false;
    }
  }

  function fileExistsAtSha(sha, filePath) {
    if (!shaExistsLocally(sha)) return false;
    const gitPath = resolveGitPath(filePath);
    if (!gitPath) return false;
    try {
      runCmd(`git cat-file -e "${sha}:${gitPath}"`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  function filesChangedAtSha(sha) {
    if (!shaExistsLocally(sha)) return new Set();
    const output = runCmd(`git diff-tree --root --no-commit-id --name-only -r "${sha}"`);
    return new Set(output.split('\n').map(file => file.trim()).filter(Boolean));
  }

  function fileBlobAtSha(sha, filePath) {
    if (!shaExistsLocally(sha)) return null;
    const gitPath = resolveGitPath(filePath);
    if (!gitPath) return null;
    try {
      return runCmd(`git rev-parse "${sha}:${gitPath}"`);
    } catch {
      return null;
    }
  }

  function getReconciliationBaseline(task) {
    const results = task.validation_results || {};
    const semantics = results.implementation_sha_semantics;
    const provenance = results.historical_provenance;
    const declared = typeof semantics === 'string' && /reconciliation baseline/i.test(semantics);
    if (!declared) return { declared: false, valid: true };

    const originalSha = provenance?.original_containing_commit_sha;
    const originalVsBaseline = provenance?.original_vs_baseline;
    const explicitlyNotOriginal = /not the original implementation commit/i.test(semantics);
    const provenanceExplainsRelationship = typeof originalVsBaseline === 'string' &&
      /original/i.test(originalVsBaseline) && /baseline/i.test(originalVsBaseline);
    const byteIdenticalEvidence = results.evidence_files?.byte_identical_at_original_and_validation_baselines === true;
    const originalCommitValid = shaExistsLocally(originalSha) && shaExistsOnOrigin(originalSha);
    const { changedFiles } = normalizeTaskFiles(task);
    const changedFilesMatchBaseline = changedFiles.length > 0 && changedFiles.every(file => {
      const originalBlob = fileBlobAtSha(originalSha, file);
      const baselineBlob = fileBlobAtSha(task.implementation_commit_sha, file);
      return originalBlob !== null && originalBlob === baselineBlob;
    });
    const valid = explicitlyNotOriginal && provenance?.remote_contained === true &&
      provenanceExplainsRelationship && byteIdenticalEvidence && originalCommitValid && changedFilesMatchBaseline;

    return {
      declared: true,
      valid,
      detail: valid
        ? `Explicit reconciliation baseline; original implementation provenance ${originalSha}`
        : 'Reconciliation baseline requires non-original semantics, original commit provenance, remote containment, relationship detail, declared byte-identical evidence, and matching Git blobs for every changed_file'
    };
  }

  function getCompletionRecordState(task) {
    if (!shaExistsLocally(task.completion_record_commit_sha)) return { valid: false };
    const tasksGitPath = resolveGitPath('docs/architecture/ledger/tasks.json');
    if (!tasksGitPath) return { valid: false };
    try {
      const raw = runCmd(`git show "${task.completion_record_commit_sha}:${tasksGitPath}"`);
      const record = JSON.parse(raw).tasks?.find(candidate => candidate.id === task.id);
      const hasEvidence = record?.evidence && (
        Array.isArray(record.evidence) ? record.evidence.length > 0 : String(record.evidence).trim().length > 0
      );
      if (record?.status !== 'completed' || !hasEvidence) return { valid: false };

      const validationPassed = record.validation_results?.passed === true ||
        record.validation_results?.overallStatus === 'PASSED';
      const hasModernCommitEvidence = isCommitSha(record.implementation_commit_sha) &&
        isCommitSha(record.clean_validation_commit_sha) &&
        isCommitSha(record.validation_results?.tested_commit) && validationPassed;
      if (hasModernCommitEvidence) return { valid: true, detail: 'Completed task record contains modern commit and passing validation evidence' };

      if (task.id === 'OPS-ARCH-001') {
        return { valid: true, detail: 'Explicit legacy compatibility: OPS-ARCH-001 completion predates modern commit-evidence fields' };
      }
      return { valid: false, detail: 'Completed task record lacks modern implementation, clean-validation, tested-commit, or passing validation evidence' };
    } catch {
      return { valid: false };
    }
  }

  function getHistoryForTask(taskId) {
    return historyEntries.filter(e => e.task_id === taskId);
  }

  function taskHasCompletionTransition(taskId) {
    const events = getHistoryForTask(taskId);
    return events.some(e => e.new_status === 'completed');
  }

  function checkDependenciesComplete(task) {
    if (!task.dependencies || task.dependencies.length === 0) return null;
    const eligibility = getDependencyEligibility(task, tasksMap);
    return {
      check: 'dependencies_complete',
      passed: eligibility.satisfied,
      ...(eligibility.satisfied ? {} : { detail: formatDependencyEligibilityReasons(eligibility) })
    };
  }

  function checkEvidence(task) {
    const hasEvidence = task.evidence && (
      Array.isArray(task.evidence) ? task.evidence.length > 0 : String(task.evidence).trim().length > 0
    );
    return { check: 'evidence_exists', passed: !!hasEvidence };
  }

  function checkChangedFiles(task) {
    const { changedFiles } = normalizeTaskFiles(task);
    return { check: 'changed_files_populated', passed: changedFiles.length > 0 };
  }

  function checkValidationFiles(task) {
    const { validationFiles } = normalizeTaskFiles(task);
    // validation_files are only required if task has validation_commands
    const hasValidationCommands = task.validation_commands && task.validation_commands.length > 0;
    if (!hasValidationCommands) {
      return { check: 'validation_files_populated', passed: true, detail: 'No validation_commands defined, skipping' };
    }
    return { check: 'validation_files_populated', passed: validationFiles.length > 0 };
  }

  function checkImplShaExists(task) {
    return { check: 'implementation_sha_exists', passed: shaExistsLocally(task.implementation_commit_sha) };
  }

  function checkImplShaRemote(task) {
    return { check: 'implementation_sha_remote_contained', passed: shaExistsOnOrigin(task.implementation_commit_sha) };
  }

  function checkCleanValidationShaExists(task) {
    return { check: 'clean_validation_sha_exists', passed: shaExistsLocally(task.clean_validation_commit_sha) };
  }

  function checkCleanValidationShaRemote(task) {
    return { check: 'clean_validation_sha_remote_contained', passed: shaExistsOnOrigin(task.clean_validation_commit_sha) };
  }

  function checkImplementationIsAncestorOfValidation(task) {
    return {
      check: 'implementation_is_ancestor_of_validation',
      passed: shaIsAncestor(task.implementation_commit_sha, task.clean_validation_commit_sha)
    };
  }

  function checkTestedCommitMatchesValidation(task) {
    return {
      check: 'tested_commit_matches_clean_validation_sha',
      passed: !!task.validation_results?.tested_commit &&
        task.validation_results.tested_commit === task.clean_validation_commit_sha
    };
  }

  function checkValidationResultsCleanValidationSha(task) {
    const recordedSha = task.validation_results?.clean_validation_commit_sha;
    return {
      check: 'validation_results_clean_validation_sha_matches',
      passed: !recordedSha || recordedSha === task.clean_validation_commit_sha,
      ...(!recordedSha ? { detail: 'Nested clean-validation SHA not recorded by legacy workflow' } : {})
    };
  }

  function checkReconciliationBaselineProvenance(task) {
    const baseline = getReconciliationBaseline(task);
    return {
      check: 'reconciliation_baseline_provenance_valid',
      passed: baseline.valid,
      ...(baseline.detail ? { detail: baseline.detail } : { detail: 'Normal implementation provenance' })
    };
  }

  function checkChangedFilesAtImplSha(task) {
    const { changedFiles } = normalizeTaskFiles(task);
    if (changedFiles.length === 0) {
      return { check: 'declared_changed_files_exist_at_impl_sha', passed: true, detail: 'No changed_files declared' };
    }
    const missingReasons = [];
    for (const f of changedFiles) {
      if (!fileExistsAtSha(task.implementation_commit_sha, f)) {
        const gitPath = resolveGitPath(f);
        if (!gitPath) {
          missingReasons.push(`${f}: INVALID_REPOSITORY_PATH`);
        } else {
          missingReasons.push(`${f}: FILE_NOT_PRESENT_AT_SHA`);
        }
      }
    }
    return {
      check: 'declared_changed_files_exist_at_impl_sha',
      passed: missingReasons.length === 0,
      ...(missingReasons.length > 0 ? { detail: missingReasons.join('; ') } : {})
    };
  }

  function checkChangedFilesMatchImplDiff(task) {
    const { changedFiles } = normalizeTaskFiles(task);
    if (changedFiles.length === 0) {
      return { check: 'declared_changed_files_match_impl_diff', passed: true, detail: 'No changed_files declared' };
    }
    const baseline = getReconciliationBaseline(task);
    if (baseline.declared) {
      return {
        check: 'declared_changed_files_match_impl_diff',
        passed: baseline.valid,
        detail: baseline.valid ? 'Explicit reconciliation baseline uses file presence instead of diff membership' : baseline.detail
      };
    }
    const implementationDiff = filesChangedAtSha(task.implementation_commit_sha);
    const missing = changedFiles.filter(file => {
      const gitPath = resolveGitPath(file);
      return !gitPath || !implementationDiff.has(gitPath);
    });
    return {
      check: 'declared_changed_files_match_impl_diff',
      passed: missing.length === 0,
      ...(missing.length > 0 ? { detail: missing.map(file => `${file}: NOT_CHANGED_AT_IMPLEMENTATION_SHA`).join('; ') } : {})
    };
  }

  function checkValidationFilesAtValidationSha(task) {
    const { validationFiles } = normalizeTaskFiles(task);
    if (validationFiles.length === 0) {
      return { check: 'declared_validation_files_exist_at_validation_sha', passed: true, detail: 'No validation_files declared' };
    }
    const missingReasons = validationFiles.filter(file => !fileExistsAtSha(task.clean_validation_commit_sha, file))
      .map(file => `${file}: FILE_NOT_PRESENT_AT_VALIDATION_SHA`);
    return {
      check: 'declared_validation_files_exist_at_validation_sha',
      passed: missingReasons.length === 0,
      ...(missingReasons.length > 0 ? { detail: missingReasons.join('; ') } : {})
    };
  }

  function checkValidationPassed(task) {
    if (!task.validation_results) return { check: 'validation_results_passed', passed: false };
    // Support both formats: { passed: true } (Phase 1+) and { overallStatus: 'PASSED' } (pre-Phase 1)
    const passed = task.validation_results.passed === true || task.validation_results.overallStatus === 'PASSED';
    return { check: 'validation_results_passed', passed };
  }

  function checkValidationRefImplSha(task) {
    if (!task.validation_results || !task.implementation_commit_sha) return { check: 'validation_results_ref_impl_sha', passed: false };
    return { check: 'validation_results_ref_impl_sha', passed: task.validation_results.implementation_commit_sha === task.implementation_commit_sha };
  }

  function checkCompletionRecordSha(task) {
    return { check: 'completion_record_sha_exists', passed: shaExistsLocally(task.completion_record_commit_sha) };
  }

  function checkCompletionRecordRemote(task) {
    return { check: 'completion_record_sha_remote_contained', passed: shaExistsOnOrigin(task.completion_record_commit_sha) };
  }

  function checkCompletionRecordAfterImplementation(task) {
    return {
      check: 'completion_record_succeeds_implementation',
      passed: shaIsAncestor(task.implementation_commit_sha, task.completion_record_commit_sha)
    };
  }

  function checkCompletionRecordAfterValidation(task) {
    return {
      check: 'completion_record_succeeds_validation',
      passed: shaIsAncestor(task.clean_validation_commit_sha, task.completion_record_commit_sha)
    };
  }

  function checkCompletionRecordContainsTask(task) {
    const state = getCompletionRecordState(task);
    return {
      check: 'completion_record_contains_completed_task',
      passed: state.valid,
      ...(state.detail ? { detail: state.detail } : {})
    };
  }

  function checkHistoryTransitions(task) {
    const hasCompletion = taskHasCompletionTransition(task.id);
    return { check: 'has_history_transitions', passed: hasCompletion };
  }

  function checkDirtyWorktree(task) {
    // A task should not depend solely on dirty/untracked files
    const { changedFiles } = normalizeTaskFiles(task);
    if (changedFiles.length === 0) return { check: 'not_only_dirty_worktree', passed: true, detail: 'No changed_files declared' };
    // If implementation_commit_sha exists, the worktree was clean at that point
    if (task.implementation_commit_sha) return { check: 'not_only_dirty_worktree', passed: true };
    return { check: 'not_only_dirty_worktree', passed: false, detail: 'No implementation commit, may depend on dirty worktree' };
  }

  const results = [];

  for (const task of completedTasks) {
    const checks = [
      checkDependenciesComplete(task),
      checkEvidence(task),
      checkChangedFiles(task),
      checkValidationFiles(task),
      checkImplShaExists(task),
      checkImplShaRemote(task),
      checkCleanValidationShaExists(task),
      checkCleanValidationShaRemote(task),
      checkImplementationIsAncestorOfValidation(task),
      checkTestedCommitMatchesValidation(task),
      checkValidationResultsCleanValidationSha(task),
      checkReconciliationBaselineProvenance(task),
      checkChangedFilesAtImplSha(task),
      checkChangedFilesMatchImplDiff(task),
      checkValidationFilesAtValidationSha(task),
      checkValidationPassed(task),
      checkValidationRefImplSha(task),
      checkCompletionRecordSha(task),
      checkCompletionRecordRemote(task),
      checkCompletionRecordAfterImplementation(task),
      checkCompletionRecordAfterValidation(task),
      checkCompletionRecordContainsTask(task),
      checkHistoryTransitions(task),
      checkDirtyWorktree(task),
    ].filter(Boolean);

    const checksObj = {};
    const failedChecks = [];
    for (const c of checks) {
      checksObj[c.check] = { passed: c.passed, ...(c.detail ? { detail: c.detail } : {}) };
      if (!c.passed) failedChecks.push(c.check);
    }

    // Classification logic
    // Contradictions = hard failures that prove completion is invalid
    const ALWAYS_CONTRADICTION_CHECKS = new Set([
      'dependencies_complete',
      'has_history_transitions',
    ]);

    // Metadata-missing checks = missing Phase 1 fields, not hard failures
    const METADATA_CHECKS = new Set([
      'changed_files_populated',
      'validation_files_populated',
      'validation_results_ref_impl_sha',
    ]);

    let classification;
    const reasons = [];
    const hasModernMetadata = hasPhase1Metadata(task);

    // Determine contradictions vs metadata gaps
    const contradictionFails = failedChecks.filter(c => ALWAYS_CONTRADICTION_CHECKS.has(c));
    const metadataFails = failedChecks.filter(c => METADATA_CHECKS.has(c));

    // Phase 1 validation checks are contradictions ONLY if the field is present
    // but invalid (not just absent)
    if (failedChecks.includes('validation_results_passed') && hasModernMetadata &&
        task.validation_results && (task.validation_results.passed === false ||
        (task.validation_results.overallStatus && task.validation_results.overallStatus !== 'PASSED'))) {
      contradictionFails.push('validation_results_passed');
    }
    const contradictionWhenPopulated = {
      implementation_sha_exists: !!task.implementation_commit_sha,
      implementation_sha_remote_contained: !!task.implementation_commit_sha,
      clean_validation_sha_exists: !!task.clean_validation_commit_sha,
      clean_validation_sha_remote_contained: !!task.clean_validation_commit_sha,
      implementation_is_ancestor_of_validation: !!task.implementation_commit_sha && !!task.clean_validation_commit_sha,
      tested_commit_matches_clean_validation_sha: !!task.validation_results?.tested_commit && !!task.clean_validation_commit_sha,
      validation_results_clean_validation_sha_matches: !!task.validation_results?.clean_validation_commit_sha && !!task.clean_validation_commit_sha,
      reconciliation_baseline_provenance_valid: getReconciliationBaseline(task).declared,
      declared_changed_files_exist_at_impl_sha: !!task.implementation_commit_sha && normalizeTaskFiles(task).changedFiles.length > 0,
      declared_changed_files_match_impl_diff: !!task.implementation_commit_sha && normalizeTaskFiles(task).changedFiles.length > 0,
      declared_validation_files_exist_at_validation_sha: !!task.clean_validation_commit_sha && normalizeTaskFiles(task).validationFiles.length > 0,
      validation_results_ref_impl_sha: !!task.validation_results?.implementation_commit_sha && !!task.implementation_commit_sha,
      completion_record_sha_exists: !!task.completion_record_commit_sha,
      completion_record_sha_remote_contained: !!task.completion_record_commit_sha,
      completion_record_succeeds_implementation: !!task.completion_record_commit_sha && !!task.implementation_commit_sha,
      completion_record_succeeds_validation: !!task.completion_record_commit_sha && !!task.clean_validation_commit_sha,
      completion_record_contains_completed_task: !!task.completion_record_commit_sha,
    };
    for (const failedCheck of failedChecks) {
      if (contradictionWhenPopulated[failedCheck]) contradictionFails.push(failedCheck);
    }

    if (contradictionFails.length > 0) {
      classification = 'INVALID_COMPLETION';
      reasons.push(...contradictionFails.map(c => `Failed: ${c}`));
    } else if (!hasModernMetadata || metadataFails.length > 0 || failedChecks.length > 0) {
      // Historical task or task with missing metadata
      classification = 'AUDIT_REQUIRED';
      if (failedChecks.length > 0) {
        reasons.push(`Missing or incomplete: ${failedChecks.join(', ')}`);
      } else {
        reasons.push('Historical task lacks Phase 1 metadata fields');
      }
    } else {
      // All checks pass
      classification = 'PASS';
    }

    // Build declared files list
    const { changedFiles, validationFiles } = normalizeTaskFiles(task);
    const declaredFiles = [...new Set([...changedFiles, ...validationFiles])];

    results.push({
      id: task.id,
      classification,
      reasons,
      implementation_commit_sha: task.implementation_commit_sha || null,
      clean_validation_commit_sha: task.clean_validation_commit_sha || null,
      completion_record_commit_sha: task.completion_record_commit_sha || null,
      declared_files: declaredFiles,
      checks: checksObj,
    });
  }

  // Build report
  const counts = { PASS: 0, AUDIT_REQUIRED: 0, INVALID_COMPLETION: 0 };
  for (const r of results) counts[r.classification]++;

  const report = {
    generated_at: new Date().toISOString(),
    ledger_commit_sha: ledgerSha,
    total_completed_tasks: results.length,
    counts,
    tasks: results,
  };

  // Compute deterministic content hash (excludes generated_at)
  const contentForHash = JSON.stringify({
    ledger_commit_sha: report.ledger_commit_sha,
    total_completed_tasks: report.total_completed_tasks,
    counts: report.counts,
    tasks: report.tasks,
  });
  report.report_content_hash = crypto.createHash('sha256').update(contentForHash).digest('hex');

  // Write report
  const reportDir = path.join(REPO_ROOT, 'test-results');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, 'architecture-completed-task-audit.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

  // Print summary
  console.log(`\n=== Completed Task Audit ===`);
  console.log(`Total completed: ${results.length}`);
  console.log(`PASS:             ${counts.PASS}`);
  console.log(`AUDIT_REQUIRED:   ${counts.AUDIT_REQUIRED}`);
  console.log(`INVALID_COMPLETION: ${counts.INVALID_COMPLETION}`);
  console.log(`Report: ${reportPath}\n`);

  return report;
}


function cmdHistory(taskId) {
  if (!fs.existsSync(HISTORY_PATH)) {
    console.log('No history found');
    return;
  }
  const lines = fs.readFileSync(HISTORY_PATH, 'utf-8').split('\n').filter(Boolean);
  const events = lines.map(l => JSON.parse(l)).filter(e => !taskId || e.task_id === taskId);
  console.log(JSON.stringify(events, null, 2));
}

// Main CLI router
const [,, subCmd, arg1, ...rest] = process.argv;

try {
  switch (subCmd) {
    case 'doctor':
      cmdDoctor();
      break;
    case 'status':
      cmdStatus();
      break;
    case 'resume':
      cmdResume();
      break;
    case 'show':
      cmdShow(arg1);
      break;
    case 'start':
      cmdTransition(arg1, 'in_progress', rest.join(' '));
      break;
    case 'implement':
      cmdTransition(arg1, 'implemented', rest.join(' '));
      break;
    case 'validate-task':
      cmdTransition(arg1, 'validated', rest.join(' '));
      break;
    case 'complete':
      cmdTransition(arg1, 'completed', rest.join(' '));
      break;
    case 'block':
      cmdTransition(arg1, 'blocked', rest.join(' '));
      break;
    case 'ready':
      cmdTransition(arg1, 'ready', rest.join(' '));
      break;
    case 'defer':
      cmdTransition(arg1, 'deferred', rest.join(' '));
      break;
    case 'history':
      cmdHistory(arg1);
      break;
    case 'generate':
      cmdGenerate();
      break;
    case 'validate':
      cmdValidate();
      break;
    case 'checkpoint':
      cmdCheckpoint(arg1);
      break;
    case 'reconcile':
      cmdReconcile();
      break;
    case 'next':
      cmdNext();
      break;
    case 'sync-obsidian':
      const res = syncObsidianMemory();
      console.log(res.success ? `✓ Synced Obsidian to ${res.path}` : `⚠ Obsidian sync skipped: ${res.reason}`);
      break;
    case 'audit-completed':
      cmdAuditCompleted();
      break;
    default:
      console.log(`Architecture Ledger CLI
Usage: node scripts/architecture-ledger.mjs <command> [args]
Commands: doctor, status, resume, show, start, implement, validate-task, complete, block, ready, defer, history, generate, validate, checkpoint, audit-completed, sync-obsidian, reconcile, next`);
  }
} catch (err) {
  console.error(`✕ Error: ${err.message}`);
  process.exit(1);
}
