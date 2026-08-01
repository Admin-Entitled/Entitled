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
    if (options.allowError) {
      return (err.stdout || '') + (err.stderr || '');
    }
    throw err;
  }
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
function validateHistoryChain() {
  if (!fs.existsSync(HISTORY_PATH)) {
    return { valid: false, error: 'history.jsonl file missing' };
  }
  const lines = fs.readFileSync(HISTORY_PATH, 'utf-8').split('\n').filter(Boolean);
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
- Next ready tasks: ${tasks.filter(t => t.status === 'ready').map(t => `\`${t.id}\``).slice(0, 5).join(', ') || 'None'}
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

    let promotedInPass = 0;
    do {
      promotedInPass = 0;
      for (const task of ledger.tasks) {
        if (task.status === 'not_started') {
          const hasBlockers = Array.isArray(task.blocking_reasons) && task.blocking_reasons.length > 0;
          if (hasBlockers) continue;

          const deps = Array.isArray(task.dependencies) ? task.dependencies : [];
          const allDepsCompleted = deps.every(depId => {
            const depTask = ledger.tasks.find(t => t.id === depId);
            return depTask && depTask.status === 'completed';
          });

          if (allDepsCompleted) {
            const prevStatus = task.status;
            task.status = 'ready';
            task.updated_timestamp = new Date().toISOString();

            saveTasksAtomic(ledger);
            appendHistoryEvent(
              task.id,
              prevStatus,
              'ready',
              'Automatic readiness reconciliation: all dependencies completed',
              `Dependencies completed: ${deps.join(', ') || 'None'}`
            );

            promotedTaskIds.push(task.id);
            promotedInPass++;
          }
        }
      }
    } while (promotedInPass > 0);

    if (promotedTaskIds.length > 0) {
      const md = generateMarkdownPlan();
      fs.writeFileSync(PLAN_MARKDOWN_PATH, md, 'utf-8');
      syncObsidianMemory();
    }

    return promotedTaskIds;
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

function selectNextTask(ledger) {
  const readyTasks = ledger.tasks.filter(t => t.status === 'ready');
  if (readyTasks.length === 0) {
    return { nextTask: null, reason: 'No tasks currently in ready status', readyTasks: [] };
  }

  const tasksMap = new Map(ledger.tasks.map(t => [t.id, t]));
  const indexMap = new Map(ledger.tasks.map((t, idx) => [t.id, idx]));

  const sortedReady = [...readyTasks].sort((a, b) => {
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
  });

  const nextTask = sortedReady[0];
  const idx = indexMap.get(nextTask.id);
  const reason = `Selected ${nextTask.id} because all dependencies are completed, status is ready, and it ranks highest by topological/phase order (ledger index ${idx}, severity ${nextTask.severity}).`;

  return {
    nextTask,
    reason,
    readyTasks: sortedReady
  };
}

function cmdReconcile() {
  const promoted = reconcileReadiness();
  if (promoted.length > 0) {
    console.log(`✓ Reconciled ${promoted.length} task(s) to 'ready': ${promoted.join(', ')}`);
  } else {
    console.log('✓ No tasks needed readiness reconciliation.');
  }
}

function cmdNext() {
  reconcileReadiness();
  const ledger = loadTasks();
  const { nextTask, reason, readyTasks } = selectNextTask(ledger);

  console.log('=== Architecture Ledger Recommended Next Task ===');
  if (!nextTask) {
    console.log('No ready tasks found.');
    return;
  }

  console.log(`Recommended Next:  ${nextTask.id} — ${nextTask.title}`);
  console.log(`Severity:          ${nextTask.severity}`);
  console.log(`Status:            ${nextTask.status}`);
  console.log(`Dependencies:      ${nextTask.dependencies.join(', ') || 'None'}`);
  console.log(`Selection Reason:  ${reason}`);
  console.log(`\nAll Ready Tasks (${readyTasks.length}):`);
  readyTasks.forEach(t => console.log(` - ${t.id} [${t.severity}]: ${t.title}`));
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
  const { nextTask, reason, readyTasks } = selectNextTask(ledger);
  console.log(`Ready Tasks:       ${readyTasks.map(t => t.id).slice(0, 5).join(', ')} (Total: ${readyTasks.length})`);
  console.log(`Recommended Next:  ${nextTask ? nextTask.id : 'None'}`);
  if (nextTask) {
    console.log(`Selection Reason:  ${reason}`);
  }
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
      const missingDeps = task.dependencies.filter(depId => {
        const dep = ledger.tasks.find(t => t.id === depId);
        return !dep || dep.status !== 'completed';
      });
      if (missingDeps.length > 0) {
        throw new Error(`Cannot transition ${taskId} to ${targetStatus}: Dependencies not completed (${missingDeps.join(', ')})`);
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
  const ids = new Set();
  for (const t of ledger.tasks) {
    if (ids.has(t.id)) {
      console.error(`✕ Duplicate task ID: ${t.id}`);
      process.exit(1);
    }
    ids.add(t.id);

    for (const dep of t.dependencies) {
      if (!ledger.tasks.some(x => x.id === dep)) {
        console.error(`✕ Task ${t.id} references non-existent dependency ${dep}`);
        process.exit(1);
      }
    }
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
    default:
      console.log(`Architecture Ledger CLI
Usage: node scripts/architecture-ledger.mjs <command> [args]
Commands: doctor, status, resume, show, start, implement, validate-task, complete, block, ready, defer, history, generate, validate, checkpoint, sync-obsidian, reconcile, next`);
  }
} catch (err) {
  console.error(`✕ Error: ${err.message}`);
  process.exit(1);
}
