import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CLI_PATH = path.join(REPO_ROOT, 'scripts', 'architecture-ledger.mjs');

describe('Architecture Ledger Automation Test Suite', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(REPO_ROOT, '.tmp-ledger-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function setupFixture(tasksOverride = [], historyOverride = null) {
    const ledgerDir = path.join(tmpDir, 'docs', 'architecture', 'ledger');
    const snapDir = path.join(ledgerDir, 'snapshots');
    fs.mkdirSync(snapDir, { recursive: true });

    const baseTasks = [
      {
        id: 'TEST-001',
        title: 'Prerequisite Task',
        description: 'First task',
        severity: 'HIGH',
        status: 'completed',
        dependencies: [],
        blocking_reasons: [],
        acceptance_criteria: ['Pass unit tests'],
        validation_commands: ['npm test'],
        evidence: 'Proof of pass',
        changed_files: [],
        created_timestamp: '2026-07-29T00:00:00Z',
        updated_timestamp: '2026-07-31T00:00:00Z',
        started_timestamp: '2026-07-29T00:00:00Z',
        implemented_timestamp: '2026-07-30T00:00:00Z',
        validated_timestamp: '2026-07-31T00:00:00Z',
        completed_timestamp: '2026-07-31T00:00:00Z',
        notes: 'Pre-completed fixture'
      },
      {
        id: 'TEST-002',
        title: 'Dependent Task',
        description: 'Second task depending on TEST-001',
        severity: 'MEDIUM',
        status: 'ready',
        dependencies: ['TEST-001'],
        blocking_reasons: [],
        acceptance_criteria: ['Complete integration'],
        validation_commands: ['npm run validate'],
        evidence: '',
        changed_files: [],
        created_timestamp: '2026-07-29T00:00:00Z',
        updated_timestamp: '2026-07-31T00:00:00Z',
        started_timestamp: null,
        implemented_timestamp: null,
        validated_timestamp: null,
        completed_timestamp: null,
        notes: 'Ready fixture'
      },
      ...tasksOverride
    ];

    const tasksPayload = {
      version: '1.0.0',
      last_updated: '2026-07-31T00:00:00Z',
      tasks: baseTasks
    };

    fs.writeFileSync(path.join(ledgerDir, 'tasks.json'), JSON.stringify(tasksPayload, null, 2));

    let prevHash = '0'.repeat(64);
    const computeHash = (e) => {
      const payload = {
        timestamp: e.timestamp,
        task_id: e.task_id,
        previous_status: e.previous_status,
        new_status: e.new_status,
        reason: e.reason,
        evidence_summary: e.evidence_summary || '',
        branch: e.branch || '',
        actor: e.actor || '',
        previous_entry_hash: e.previous_entry_hash
      };
      const sortedKeys = Object.keys(payload).sort();
      const sortedObj = {};
      for (const k of sortedKeys) sortedObj[k] = payload[k];
      return crypto.createHash('sha256').update(JSON.stringify(sortedObj)).digest('hex');
    };

    const genEntry = {
      timestamp: '2026-07-29T00:00:00Z',
      task_id: 'SYSTEM-GENESIS',
      previous_status: 'none',
      new_status: 'initialized',
      reason: 'Genesis fixture',
      evidence_summary: 'Init',
      branch: 'test',
      actor: 'test',
      previous_entry_hash: prevHash
    };
    genEntry.current_entry_hash = computeHash(genEntry);
    prevHash = genEntry.current_entry_hash;

    const test1Entry = {
      timestamp: '2026-07-31T00:00:00Z',
      task_id: 'TEST-001',
      previous_status: 'ready',
      new_status: 'completed',
      reason: 'Fixture completed',
      evidence_summary: 'Proof of pass',
      branch: 'test',
      actor: 'test',
      previous_entry_hash: prevHash
    };
    test1Entry.current_entry_hash = computeHash(test1Entry);

    const historyContent = historyOverride !== null
      ? historyOverride
      : [JSON.stringify(genEntry), JSON.stringify(test1Entry)].join('\n') + '\n';

    fs.writeFileSync(path.join(ledgerDir, 'history.jsonl'), historyContent);

    const schemaSrc = path.join(REPO_ROOT, 'docs', 'architecture', 'ledger', 'schema.json');
    if (fs.existsSync(schemaSrc)) {
      fs.copyFileSync(schemaSrc, path.join(ledgerDir, 'schema.json'));
    }

    try {
      execSync(`node ${CLI_PATH} generate`, { cwd: tmpDir, encoding: 'utf-8' });
    } catch (e) {}

    return { ledgerDir, snapDir };
  }

  it('validates a healthy ledger and history hash chain', () => {
    setupFixture();
    const res = execSync(`node ${CLI_PATH} doctor`, { cwd: tmpDir, encoding: 'utf-8' });
    assert.match(res, /Architecture ledger system is healthy/);
  });

  it('detects history hash-chain tampering', () => {
    const { ledgerDir } = setupFixture();
    const historyPath = path.join(ledgerDir, 'history.jsonl');
    const lines = fs.readFileSync(historyPath, 'utf-8').split('\n').filter(Boolean);
    const tamperedEntry = JSON.parse(lines[1]);
    tamperedEntry.reason = 'Tampered reason string';
    lines[1] = JSON.stringify(tamperedEntry);
    fs.writeFileSync(historyPath, lines.join('\n') + '\n');

    assert.throws(() => {
      execSync(`node ${CLI_PATH} validate`, { cwd: tmpDir, encoding: 'utf-8' });
    }, /tampered/i);
  });

  it('detects history deletion', () => {
    const { ledgerDir } = setupFixture();
    const historyPath = path.join(ledgerDir, 'history.jsonl');
    fs.writeFileSync(historyPath, '');

    assert.throws(() => {
      execSync(`node ${CLI_PATH} validate`, { cwd: tmpDir, encoding: 'utf-8' });
    }, /history.jsonl is empty/i);
  });

  it('detects duplicate task IDs', () => {
    setupFixture([
      {
        id: 'TEST-001',
        title: 'Duplicate Task ID',
        description: 'Duplicated',
        severity: 'LOW',
        status: 'not_started',
        dependencies: [],
        blocking_reasons: [],
        acceptance_criteria: [],
        validation_commands: [],
        evidence: '',
        changed_files: [],
        created_timestamp: '2026-07-29T00:00:00Z',
        updated_timestamp: '2026-07-29T00:00:00Z',
        started_timestamp: null,
        implemented_timestamp: null,
        validated_timestamp: null,
        completed_timestamp: null,
        notes: ''
      }
    ]);

    assert.throws(() => {
      execSync(`node ${CLI_PATH} validate`, { cwd: tmpDir, encoding: 'utf-8' });
    }, /Duplicate task ID/i);
  });

  it('enforces valid transitions and prevents unfulfilled dependency transitions', () => {
    setupFixture([
      {
        id: 'TEST-003',
        title: 'Blocked Task',
        description: 'Needs uncompleted task',
        severity: 'HIGH',
        status: 'not_started',
        dependencies: ['TEST-999'],
        blocking_reasons: [],
        acceptance_criteria: [],
        validation_commands: [],
        evidence: '',
        changed_files: [],
        created_timestamp: '2026-07-29T00:00:00Z',
        updated_timestamp: '2026-07-29T00:00:00Z',
        started_timestamp: null,
        implemented_timestamp: null,
        validated_timestamp: null,
        completed_timestamp: null,
        notes: ''
      }
    ]);

    // Should fail validation because TEST-999 doesn't exist
    assert.throws(() => {
      execSync(`node ${CLI_PATH} validate`, { cwd: tmpDir, encoding: 'utf-8' });
    }, /non-existent dependency/i);
  });

  it('refuses completion without required evidence', () => {
    setupFixture();
    // Try to complete TEST-002 without evidence
    assert.throws(() => {
      execSync(`node ${CLI_PATH} complete TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    }, /Evidence required/i);
  });

  it('executes valid state transition lifecycle (start -> implement -> validate-task -> complete)', () => {
    setupFixture();
    execSync(`node ${CLI_PATH} start TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    execSync(`node ${CLI_PATH} implement TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    execSync(`node ${CLI_PATH} validate-task TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    execSync(`node ${CLI_PATH} complete TEST-002 "Verified implementation and tests pass"`, { cwd: tmpDir, encoding: 'utf-8' });

    const showOut = execSync(`node ${CLI_PATH} show TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    const task = JSON.parse(showOut);
    assert.strictEqual(task.status, 'completed');
    assert.match(String(task.evidence), /Verified implementation/);
  });

  it('creates snapshots on major state transitions', () => {
    const { snapDir } = setupFixture();
    const beforeCount = fs.readdirSync(snapDir).length;
    execSync(`node ${CLI_PATH} block TEST-002 "Waiting for API credentials"`, { cwd: tmpDir, encoding: 'utf-8' });
    const afterCount = fs.readdirSync(snapDir).length;
    assert.strictEqual(afterCount, beforeCount + 1);
  });

  it('detects generated Markdown report drift', () => {
    setupFixture();
    execSync(`node ${CLI_PATH} generate`, { cwd: tmpDir, encoding: 'utf-8' });
    const mdPath = path.join(tmpDir, 'docs', 'architecture', 'ARCHITECTURE_REMEDIATION_MASTER_PLAN.md');
    fs.appendFileSync(mdPath, '\n### Tampered Section Header\nManual edit without ledger update.\n');

    assert.throws(() => {
      execSync(`node ${CLI_PATH} validate`, { cwd: tmpDir, encoding: 'utf-8' });
    }, /drift/i);
  });

  it('persists task completion across new process invocations', () => {
    setupFixture();
    execSync(`node ${CLI_PATH} start TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    execSync(`node ${CLI_PATH} implement TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    execSync(`node ${CLI_PATH} validate-task TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    execSync(`node ${CLI_PATH} complete TEST-002 "Self-contained test run"`, { cwd: tmpDir, encoding: 'utf-8' });

    // Separate child process read
    const out = execSync(`node -e 'const { execSync } = require("child_process"); console.log(execSync("node ${CLI_PATH} show TEST-002", { cwd: "${tmpDir}" }).toString());'`, { encoding: 'utf-8' });
    const task = JSON.parse(out);
    assert.strictEqual(task.status, 'completed');
  });

  it('retains validated status if checkpoint push fails', () => {
    setupFixture();
    execSync(`node ${CLI_PATH} start TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    execSync(`node ${CLI_PATH} implement TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    execSync(`node ${CLI_PATH} validate-task TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });

    // Checkpoint should fail push in isolated tmpDir without origin remote
    assert.throws(() => {
      execSync(`node ${CLI_PATH} checkpoint TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    });

    const showOut = execSync(`node ${CLI_PATH} show TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    const task = JSON.parse(showOut);
    assert.strictEqual(task.status, 'validated');
  });

  it('gracefully handles secondary Obsidian sync failure without corrupting ledger', () => {
    setupFixture();
    const syncRes = execSync(`node ${CLI_PATH} sync-obsidian`, { cwd: tmpDir, encoding: 'utf-8' });
    // In isolated tmpDir Obsidian path may not exist, should report skipped/handled without throwing process exit
    assert.match(syncRes, /Obsidian/);

    const doctorRes = execSync(`node ${CLI_PATH} doctor`, { cwd: tmpDir, encoding: 'utf-8' });
    assert.match(doctorRes, /healthy/);
  });

  it('throws error when operating on non-existent task', () => {
    setupFixture();
    assert.throws(() => {
      execSync(`node ${CLI_PATH} show NON-EXISTENT-999`, { cwd: tmpDir, encoding: 'utf-8' });
    }, /not found/i);
  });

  it('refuses checkpoint when task is not in validated status', () => {
    setupFixture();
    assert.throws(() => {
      execSync(`node ${CLI_PATH} checkpoint TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    }, /must be in 'validated' status/i);
  });

  it('maintains deterministic output on repeated generation', () => {
    setupFixture();
    execSync(`node ${CLI_PATH} generate`, { cwd: tmpDir, encoding: 'utf-8' });
    const mdPath = path.join(tmpDir, 'docs', 'architecture', 'ARCHITECTURE_REMEDIATION_MASTER_PLAN.md');
    const firstGen = fs.readFileSync(mdPath, 'utf-8');
    execSync(`node ${CLI_PATH} generate`, { cwd: tmpDir, encoding: 'utf-8' });
    const secondGen = fs.readFileSync(mdPath, 'utf-8');
    assert.strictEqual(firstGen, secondGen);
  });

  it('recovers from temporary atomic-write file left behind', () => {
    const { ledgerDir } = setupFixture();
    const tmpTasksPath = path.join(ledgerDir, 'tasks.json.tmp');
    fs.writeFileSync(tmpTasksPath, '{"invalid": true}');
    
    // Ledger doctor should still pass because atomic swap cleans or ignores orphan tmp files
    const res = execSync(`node ${CLI_PATH} doctor`, { cwd: tmpDir, encoding: 'utf-8' });
    assert.match(res, /healthy/);
  });

});
