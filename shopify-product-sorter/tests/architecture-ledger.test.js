import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { preflightSuite, runPreflight } from '../scripts/regression-gate.mjs';

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
    execSync(`node ${CLI_PATH} start TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    execSync(`node ${CLI_PATH} implement TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    execSync(`node ${CLI_PATH} validate-task TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    // Try to complete TEST-002 without evidence
    assert.throws(() => {
      execSync(`node ${CLI_PATH} complete TEST-002`, { cwd: tmpDir, encoding: 'utf-8' });
    }, /Evidence required/i);
  });

  it('refuses completion without prior validation', () => {
    setupFixture();
    assert.throws(() => {
      execSync(`node ${CLI_PATH} complete TEST-002 "Some evidence"`, { cwd: tmpDir, encoding: 'utf-8' });
    }, /validated/i);
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
    execSync('git init', { cwd: tmpDir, encoding: 'utf-8' });
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
    }, /must be in validated status/i);
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

    it("promotes not_started task to ready when all dependencies are completed", () => {
    const { ledgerDir } = setupFixture();
    const tasksPath = path.join(ledgerDir, "tasks.json");
    const ledger = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    ledger.tasks.push({
      id: "TEST-003",
      title: "Unblocked Task",
      description: "Task ready to be promoted",
      severity: "HIGH",
      status: "not_started",
      dependencies: ["TEST-001"],
      blocking_reasons: [],
      acceptance_criteria: ["Criteria 1"],
      validation_commands: ["echo ok"],
      evidence: "",
      changed_files: [],
      created_timestamp: "2026-07-29T00:00:00Z",
      updated_timestamp: "2026-07-31T00:00:00Z",
      started_timestamp: null,
      implemented_timestamp: null,
      validated_timestamp: null,
      completed_timestamp: null,
      notes: ""
    });
    fs.writeFileSync(tasksPath, JSON.stringify(ledger, null, 2));

    const res = execSync(`node ${CLI_PATH} reconcile`, { cwd: tmpDir, encoding: "utf-8" });
    assert.match(res, /TEST-003/);

    const showOut = execSync(`node ${CLI_PATH} show TEST-003`, { cwd: tmpDir, encoding: "utf-8" });
    const task = JSON.parse(showOut);
    assert.strictEqual(task.status, "ready");
  });

  it("prevents promotion when dependency is incomplete", () => {
    setupFixture([
      {
        id: "TEST-004",
        title: "Blocked by incomplete dep",
        description: "Task depending on ready (not completed) TEST-002",
        severity: "HIGH",
        status: "not_started",
        dependencies: ["TEST-002"],
        blocking_reasons: [],
        acceptance_criteria: ["Criteria 1"],
        validation_commands: ["echo ok"],
        evidence: "",
        changed_files: [],
        created_timestamp: "2026-07-29T00:00:00Z",
        updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null,
        implemented_timestamp: null,
        validated_timestamp: null,
        completed_timestamp: null,
        notes: ""
      }
    ]);

    execSync(`node ${CLI_PATH} reconcile`, { cwd: tmpDir, encoding: "utf-8" });
    const showOut = execSync(`node ${CLI_PATH} show TEST-004`, { cwd: tmpDir, encoding: "utf-8" });
    const task = JSON.parse(showOut);
    assert.strictEqual(task.status, "not_started");
  });

  it("prevents promotion when task has active blockers", () => {
    setupFixture([
      {
        id: "TEST-005",
        title: "Task with blocker",
        description: "Task with active blocking reasons",
        severity: "HIGH",
        status: "not_started",
        dependencies: ["TEST-001"],
        blocking_reasons: ["Waiting for external API key"],
        acceptance_criteria: ["Criteria 1"],
        validation_commands: ["echo ok"],
        evidence: "",
        changed_files: [],
        created_timestamp: "2026-07-29T00:00:00Z",
        updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null,
        implemented_timestamp: null,
        validated_timestamp: null,
        completed_timestamp: null,
        notes: ""
      }
    ]);

    execSync(`node ${CLI_PATH} reconcile`, { cwd: tmpDir, encoding: "utf-8" });
    const showOut = execSync(`node ${CLI_PATH} show TEST-005`, { cwd: tmpDir, encoding: "utf-8" });
    const task = JSON.parse(showOut);
    assert.strictEqual(task.status, "not_started");
  });

  it("appends history entry on readiness promotion", () => {
    const { ledgerDir } = setupFixture();
    const tasksPath = path.join(ledgerDir, "tasks.json");
    const ledger = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    ledger.tasks.push({
      id: "TEST-003",
      title: "Unblocked Task",
      description: "Task ready to be promoted",
      severity: "HIGH",
      status: "not_started",
      dependencies: ["TEST-001"],
      blocking_reasons: [],
      acceptance_criteria: ["Criteria 1"],
      validation_commands: ["echo ok"],
      evidence: "",
      changed_files: [],
      created_timestamp: "2026-07-29T00:00:00Z",
      updated_timestamp: "2026-07-31T00:00:00Z",
      started_timestamp: null,
      implemented_timestamp: null,
      validated_timestamp: null,
      completed_timestamp: null,
      notes: ""
    });
    fs.writeFileSync(tasksPath, JSON.stringify(ledger, null, 2));

    execSync(`node ${CLI_PATH} reconcile`, { cwd: tmpDir, encoding: "utf-8" });
    const historyOut = execSync(`node ${CLI_PATH} history TEST-003`, { cwd: tmpDir, encoding: "utf-8" });
    const events = JSON.parse(historyOut);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].previous_status, "not_started");
    assert.strictEqual(events[0].new_status, "ready");

    const doctorRes = execSync(`node ${CLI_PATH} doctor`, { cwd: tmpDir, encoding: "utf-8" });
    assert.match(doctorRes, /healthy/);
  });

  it("ensures repeated reconciliation is idempotent", () => {
    const { ledgerDir } = setupFixture();
    const tasksPath = path.join(ledgerDir, "tasks.json");
    const ledger = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    ledger.tasks.push({
      id: "TEST-003",
      title: "Unblocked Task",
      description: "Task ready to be promoted",
      severity: "HIGH",
      status: "not_started",
      dependencies: ["TEST-001"],
      blocking_reasons: [],
      acceptance_criteria: ["Criteria 1"],
      validation_commands: ["echo ok"],
      evidence: "",
      changed_files: [],
      created_timestamp: "2026-07-29T00:00:00Z",
      updated_timestamp: "2026-07-31T00:00:00Z",
      started_timestamp: null,
      implemented_timestamp: null,
      validated_timestamp: null,
      completed_timestamp: null,
      notes: ""
    });
    fs.writeFileSync(tasksPath, JSON.stringify(ledger, null, 2));

    execSync(`node ${CLI_PATH} reconcile`, { cwd: tmpDir, encoding: "utf-8" });
    const histPath = path.join(tmpDir, "docs", "architecture", "ledger", "history.jsonl");
    const countAfterFirst = fs.readFileSync(histPath, "utf-8").split("\n").filter(Boolean).length;

    const resSecond = execSync(`node ${CLI_PATH} reconcile`, { cwd: tmpDir, encoding: "utf-8" });
    assert.match(resSecond, /No tasks needed/);

    const countAfterSecond = fs.readFileSync(histPath, "utf-8").split("\n").filter(Boolean).length;
    assert.strictEqual(countAfterSecond, countAfterFirst);
  });

  it("selects next task deterministically based on ordering rules", () => {
    const { ledgerDir } = setupFixture();
    const tasksPath = path.join(ledgerDir, "tasks.json");
    const ledger = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    const t2 = ledger.tasks.find(t => t.id === "TEST-002");
    if (t2) t2.status = "completed";
    ledger.tasks.push(
      {
        id: "TASK-EARLY",
        title: "Earlier Task",
        description: "Task earlier in ledger",
        severity: "CRITICAL",
        status: "ready",
        dependencies: ["TEST-001"],
        blocking_reasons: [],
        acceptance_criteria: ["Criteria 1"],
        validation_commands: ["echo ok"],
        evidence: "",
        changed_files: [],
        created_timestamp: "2026-07-29T00:00:00Z",
        updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null,
        implemented_timestamp: null,
        validated_timestamp: null,
        completed_timestamp: null,
        notes: ""
      },
      {
        id: "TASK-LATER",
        title: "Later Task",
        description: "Task later in ledger",
        severity: "CRITICAL",
        status: "ready",
        dependencies: ["TEST-001"],
        blocking_reasons: [],
        acceptance_criteria: ["Criteria 1"],
        validation_commands: ["echo ok"],
        evidence: "",
        changed_files: [],
        created_timestamp: "2026-07-29T00:00:00Z",
        updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null,
        implemented_timestamp: null,
        validated_timestamp: null,
        completed_timestamp: null,
        notes: ""
      }
    );
    fs.writeFileSync(tasksPath, JSON.stringify(ledger, null, 2));

    const res = execSync(`node ${CLI_PATH} next`, { cwd: tmpDir, encoding: "utf-8" });
    assert.match(res, /Recommended Next:\s+TASK-EARLY/);
  });

  it("selects OWN-003 before inappropriate later tasks when ordering rules require it", () => {
    const { ledgerDir } = setupFixture();
    const tasksPath = path.join(ledgerDir, "tasks.json");
    const ledger = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
    const t2 = ledger.tasks.find(t => t.id === "TEST-002");
    if (t2) t2.status = "completed";
    ledger.tasks.push(
      {
        id: "OWN-003",
        title: "Classify Order Mapping",
        description: "Important task",
        severity: "CRITICAL",
        status: "not_started",
        dependencies: ["TEST-001"],
        blocking_reasons: [],
        acceptance_criteria: ["Criteria 1"],
        validation_commands: ["echo ok"],
        evidence: "",
        changed_files: [],
        created_timestamp: "2026-07-29T00:00:00Z",
        updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null,
        implemented_timestamp: null,
        validated_timestamp: null,
        completed_timestamp: null,
        notes: ""
      },
      {
        id: "OWN-008",
        title: "Approve data ownership matrix",
        description: "Later task",
        severity: "CRITICAL",
        status: "ready",
        dependencies: ["TEST-001"],
        blocking_reasons: [],
        acceptance_criteria: ["Criteria 1"],
        validation_commands: ["echo ok"],
        evidence: "",
        changed_files: [],
        created_timestamp: "2026-07-29T00:00:00Z",
        updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null,
        implemented_timestamp: null,
        validated_timestamp: null,
        completed_timestamp: null,
        notes: ""
      }
    );
    fs.writeFileSync(tasksPath, JSON.stringify(ledger, null, 2));

    const res = execSync(`node ${CLI_PATH} next`, { cwd: tmpDir, encoding: "utf-8" });
    assert.match(res, /Recommended Next:\s+OWN-003/);
  });

  describe("Checkpoint and Preflight Hardening Suite", () => {
    it("blocks checkpoint when untracked implementation file exists (UNTRACKED_IMPLEMENTATION_FILE)", () => {
      setupFixture();
      execSync("git init", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.name \"Test User\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.email \"test@example.com\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync("git commit -m \"init\"", { cwd: tmpDir, stdio: "pipe" });

      execSync("node " + CLI_PATH + " start TEST-002", { cwd: tmpDir, stdio: "pipe" });
      execSync("node " + CLI_PATH + " implement TEST-002", { cwd: tmpDir, stdio: "pipe" });
      execSync("node " + CLI_PATH + " validate-task TEST-002", { cwd: tmpDir, stdio: "pipe" });

      fs.mkdirSync(path.join(tmpDir, "server/src"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "server/src/untrackedImpl.js"), "console.log(\"test\");");

      assert.throws(() => {
        execSync("node " + CLI_PATH + " checkpoint TEST-002", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" });
      }, /UNTRACKED_IMPLEMENTATION_FILE/i);
    });

    it("blocks checkpoint when declared validation file is untracked (UNTRACKED_DECLARED_FILE)", () => {
      const { ledgerDir } = setupFixture();
      const tasksPath = path.join(ledgerDir, "tasks.json");
      const ledger = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
      const t2 = ledger.tasks.find(t => t.id === "TEST-002");
      t2.status = "validated";
      t2.validation_files = ["server/src/untrackedVal.js"];
      fs.writeFileSync(tasksPath, JSON.stringify(ledger, null, 2));

      execSync("git init", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.name \"Test User\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.email \"test@example.com\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync("git commit -m \"init\"", { cwd: tmpDir, stdio: "pipe" });

      fs.mkdirSync(path.join(tmpDir, "server/src"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "server/src/untrackedVal.js"), "// untracked");

      assert.throws(() => {
        execSync("node " + CLI_PATH + " checkpoint TEST-002", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" });
      }, /UNTRACKED_DECLARED_FILE/i);
    });

    it("blocks checkpoint when declared file is absent from HEAD (FILE_ABSENT_FROM_HEAD / MISSING_DECLARED_FILE)", () => {
      const { ledgerDir } = setupFixture();
      const tasksPath = path.join(ledgerDir, "tasks.json");
      const ledger = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
      const t2 = ledger.tasks.find(t => t.id === "TEST-002");
      t2.status = "validated";
      t2.files_changed = ["server/src/absentFile.js"];
      fs.writeFileSync(tasksPath, JSON.stringify(ledger, null, 2));

      execSync("git init", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.name \"Test User\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.email \"test@example.com\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync("git commit -m \"init\"", { cwd: tmpDir, stdio: "pipe" });

      assert.throws(() => {
        execSync("node " + CLI_PATH + " checkpoint TEST-002", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" });
      }, /(MISSING_DECLARED_FILE|FILE_ABSENT_FROM_HEAD)/i);
    });

    it("returns PASS and is idempotent when checkpointing already completed task", () => {
      setupFixture();
      const out = execSync("node " + CLI_PATH + " checkpoint TEST-001", { cwd: tmpDir, encoding: "utf-8" });
      assert.match(out, /COMMITTED-STATE VALIDATION: PASS/);
    });

    it("preflightSuite flags missing test file (MISSING_TEST_FILE)", () => {
      const res = preflightSuite({ name: "Fake Suite", file: "server/src/services/nonExistent.test.js" }, tmpDir);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.category, "MISSING_TEST_FILE");
    });

    it("preflightSuite flags untracked test file (UNTRACKED_TEST_FILE)", () => {
      execSync("git init", { cwd: tmpDir, stdio: "pipe" });
      fs.mkdirSync(path.join(tmpDir, "server/src/services"), { recursive: true });
      const testFile = "server/src/services/untracked.test.js";
      fs.writeFileSync(path.join(tmpDir, testFile), "console.log(\"test\");");

      const res = preflightSuite({ name: "Untracked Suite", file: testFile }, tmpDir);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.category, "UNTRACKED_TEST_FILE");
    });

    it("preflightSuite flags file absent from HEAD (NOT_PRESENT_IN_HEAD)", () => {
      execSync("git init", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.name \"Test User\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.email \"test@example.com\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      fs.mkdirSync(path.join(tmpDir, "server/src/services"), { recursive: true });
      const baseFile = "server/src/services/base.test.js";
      fs.writeFileSync(path.join(tmpDir, baseFile), "// base");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync("git commit -m \"init\"", { cwd: tmpDir, stdio: "pipe" });

      const newFile = "server/src/services/stagedOnly.test.js";
      fs.writeFileSync(path.join(tmpDir, newFile), "// staged only");
      execSync("git add " + newFile, { cwd: tmpDir, stdio: "pipe" });

      const res = preflightSuite({ name: "Staged Suite", file: newFile }, tmpDir);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.category, "NOT_PRESENT_IN_HEAD");
    });

    it("preflightSuite flags live production opt-in (ENVIRONMENT_SAFETY_FAILURE)", () => {
      execSync("git init", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.name \"Test User\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.email \"test@example.com\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      fs.mkdirSync(path.join(tmpDir, "server/src/services"), { recursive: true });
      const unsafeFile = "server/src/services/unsafe.test.js";
      fs.writeFileSync(path.join(tmpDir, unsafeFile), "process.env.ALLOW_PROD_TEST_RUN = \"true\";");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync("git commit -m \"init\"", { cwd: tmpDir, stdio: "pipe" });

      const res = preflightSuite({ name: "Unsafe Suite", file: unsafeFile }, tmpDir);
      assert.strictEqual(res.valid, false);
      assert.strictEqual(res.category, "ENVIRONMENT_SAFETY_FAILURE");
    });
  });

});
