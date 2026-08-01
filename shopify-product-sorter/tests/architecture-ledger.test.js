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
    }, /must be in validated or completed status/i);
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
      const { ledgerDir } = setupFixture();
      // Give TEST-002 a changed_files entry so validateDeclaredFilesNonEmpty passes
      const tasksPath = path.join(ledgerDir, "tasks.json");
      const ledger = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
      ledger.tasks.find(t => t.id === "TEST-002").changed_files = ["docs/architecture/ledger/tasks.json"];
      fs.writeFileSync(tasksPath, JSON.stringify(ledger, null, 2));

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

    it("rejects completed task with empty changed_files (no false PASS shortcut)", () => {
      setupFixture();
      // TEST-001 is completed but has empty changed_files — Phase 1 rejects this
      assert.throws(() => {
        execSync("node " + CLI_PATH + " checkpoint TEST-001", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" });
      }, /EMPTY_DECLARED_FILES/i);
    });

    it("rejects checkpoint when both files_changed and changed_files are present (CONFLICTING_FILE_FIELDS)", () => {
      const { ledgerDir } = setupFixture();
      const tasksPath = path.join(ledgerDir, "tasks.json");
      const ledger = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
      const t2 = ledger.tasks.find(t => t.id === "TEST-002");
      t2.status = "validated";
      t2.files_changed = ["scripts/architecture-ledger.mjs"];
      t2.changed_files = ["scripts/architecture-ledger.mjs"];
      fs.writeFileSync(tasksPath, JSON.stringify(ledger, null, 2));

      assert.throws(() => {
        execSync("node " + CLI_PATH + " checkpoint TEST-002", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" });
      }, /CONFLICTING_FILE_FIELDS/i);
    });

    it("rejects checkpoint when changed_files and validation_files are both empty (EMPTY_DECLARED_FILES)", () => {
      const { ledgerDir } = setupFixture();
      const tasksPath = path.join(ledgerDir, "tasks.json");
      const ledger = JSON.parse(fs.readFileSync(tasksPath, "utf-8"));
      const t2 = ledger.tasks.find(t => t.id === "TEST-002");
      t2.status = "validated";
      t2.changed_files = [];
      t2.validation_files = [];
      fs.writeFileSync(tasksPath, JSON.stringify(ledger, null, 2));

      assert.throws(() => {
        execSync("node " + CLI_PATH + " checkpoint TEST-002", { cwd: tmpDir, encoding: "utf-8", stdio: "pipe" });
      }, /EMPTY_DECLARED_FILES/i);
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

  describe("Completed Task Audit Suite", () => {
    let auditGitRoot;

    beforeEach(() => {
      auditGitRoot = tmpDir;
      tmpDir = path.join(auditGitRoot, 'shopify-product-sorter');
      fs.mkdirSync(tmpDir, { recursive: true });
    });

    afterEach(() => {
      fs.rmSync(auditGitRoot, { recursive: true, force: true });
      tmpDir = auditGitRoot;
    });

    function setupAuditFixture(tasksOverride = [], historyOverride = null) {
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
          timestamp: e.timestamp, task_id: e.task_id,
          previous_status: e.previous_status, new_status: e.new_status,
          reason: e.reason, evidence_summary: e.evidence_summary || '',
          branch: e.branch || '', actor: e.actor || '',
          previous_entry_hash: e.previous_entry_hash
        };
        const sortedKeys = Object.keys(payload).sort();
        const sortedObj = {};
        for (const k of sortedKeys) sortedObj[k] = payload[k];
        return crypto.createHash('sha256').update(JSON.stringify(sortedObj)).digest('hex');
      };

      const genEntry = {
        timestamp: '2026-07-29T00:00:00Z', task_id: 'SYSTEM-GENESIS',
        previous_status: 'none', new_status: 'initialized',
        reason: 'Genesis fixture', evidence_summary: 'Init',
        branch: 'test', actor: 'test', previous_entry_hash: prevHash
      };
      genEntry.current_entry_hash = computeHash(genEntry);
      prevHash = genEntry.current_entry_hash;

      const test1Entry = {
        timestamp: '2026-07-31T00:00:00Z', task_id: 'TEST-001',
        previous_status: 'ready', new_status: 'completed',
        reason: 'Fixture completed', evidence_summary: 'Proof of pass',
        branch: 'test', actor: 'test', previous_entry_hash: prevHash
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

    function runAudit({ push = true } = {}) {
      if (push && fs.existsSync(path.join(auditGitRoot, '.git'))) {
        const originDir = path.join(auditGitRoot, '.origin.git');
        if (!fs.existsSync(originDir)) {
          execSync(`git init --bare "${originDir}"`, { cwd: auditGitRoot, stdio: 'pipe' });
          execSync(`git remote add origin "${originDir}"`, { cwd: auditGitRoot, stdio: 'pipe' });
        }
        execSync('git push -u origin HEAD', { cwd: auditGitRoot, stdio: 'pipe' });
      }
      const out = execSync(`node ${CLI_PATH} audit-completed`, { cwd: tmpDir, encoding: 'utf-8' });
      const reportPath = path.join(tmpDir, 'test-results', 'architecture-completed-task-audit.json');
      return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    }

    it("classifies valid completed task as PASS", () => {
      // Init git repo in tmpDir first so we can get its HEAD SHA
      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync("git config user.name \"Test\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.email \"test@test.com\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      // Create a file so there is a real commit
      fs.writeFileSync(path.join(tmpDir, "placeholder.txt"), "init");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync("git commit -m \"init\"", { cwd: tmpDir, stdio: "pipe" });
      const sha = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();

      setupAuditFixture([{
        id: "AUDIT-001", title: "Full Phase 1 Task", description: "Complete", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["placeholder.txt"],
        validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: "2026-07-29T00:00:00Z", implemented_timestamp: "2026-07-30T00:00:00Z",
        validated_timestamp: "2026-07-31T00:00:00Z", completed_timestamp: "2026-07-31T00:00:00Z",
        notes: "", implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      // Build extra history entry for AUDIT-001
      const ledgerDir = path.join(tmpDir, "docs", "architecture", "ledger");
      const historyPath = path.join(ledgerDir, "history.jsonl");
      const existingHistory = fs.readFileSync(historyPath, "utf-8").trim();
      const previousEntry = JSON.parse(existingHistory.split("\n").at(-1));
      const entry = {
        timestamp: "2026-07-31T00:00:00Z", task_id: "AUDIT-001",
        previous_status: "validated", new_status: "completed",
        reason: "Completed", evidence_summary: "Done",
        branch: "test", actor: "test",
        previous_entry_hash: previousEntry.current_entry_hash
      };
      // Compute hash
      const payload = { timestamp: entry.timestamp, task_id: entry.task_id,
        previous_status: entry.previous_status, new_status: entry.new_status,
        reason: entry.reason, evidence_summary: entry.evidence_summary,
        branch: entry.branch, actor: entry.actor,
        previous_entry_hash: entry.previous_entry_hash };
      const sortedKeys = Object.keys(payload).sort();
      const sortedObj = {};
      for (const k of sortedKeys) sortedObj[k] = payload[k];
      entry.current_entry_hash = crypto.createHash("sha256").update(JSON.stringify(sortedObj)).digest("hex");
      fs.writeFileSync(historyPath, existingHistory + "\n" + JSON.stringify(entry) + "\n");

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "AUDIT-001");
      assert.strictEqual(task.classification, "PASS");
      assert.deepStrictEqual(task.reasons, []);
      assert.strictEqual(report.counts.PASS, 1);
    });

    it("classifies task without Phase 1 metadata as AUDIT_REQUIRED", () => {
      setupAuditFixture();
      const report = runAudit();
      const task = report.tasks.find(t => t.id === "TEST-001");
      assert.strictEqual(task.classification, "AUDIT_REQUIRED");
      assert.ok(task.reasons.length > 0);
      assert.ok(report.counts.AUDIT_REQUIRED >= 1);
    });

    it("classifies task with incomplete dependency as INVALID_COMPLETION", () => {
      const sha = execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
      setupAuditFixture([{
        id: "AUDIT-002", title: "Bad Deps", description: "Incomplete dep", severity: "HIGH",
        status: "completed", dependencies: ["TEST-002"], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["docs/architecture/ledger/tasks.json"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync("git config user.name \"Test\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.email \"test@test.com\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync("git commit -m \"init\"", { cwd: tmpDir, stdio: "pipe" });

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "AUDIT-002");
      assert.strictEqual(task.classification, "INVALID_COMPLETION");
      assert.ok(task.reasons.some(r => r.includes("dependencies_complete")));
    });

    it("classifies task with missing implementation commit as AUDIT_REQUIRED", () => {
      setupAuditFixture([{
        id: "AUDIT-003", title: "No SHA", description: "Missing impl sha", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: [], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: ""
      }]);

      // Add history entry for AUDIT-003
      const ledgerDir = path.join(tmpDir, "docs", "architecture", "ledger");
      const historyPath = path.join(ledgerDir, "history.jsonl");
      const existingHistory = fs.readFileSync(historyPath, "utf-8").trim();
      const entry = {
        timestamp: "2026-07-31T00:00:00Z", task_id: "AUDIT-003",
        previous_status: "validated", new_status: "completed",
        reason: "Completed", evidence_summary: "Done",
        branch: "test", actor: "test",
        previous_entry_hash: "0".repeat(64)
      };
      const payload = { timestamp: entry.timestamp, task_id: entry.task_id,
        previous_status: entry.previous_status, new_status: entry.new_status,
        reason: entry.reason, evidence_summary: entry.evidence_summary,
        branch: entry.branch, actor: entry.actor,
        previous_entry_hash: entry.previous_entry_hash };
      const sortedKeys = Object.keys(payload).sort();
      const sortedObj = {};
      for (const k of sortedKeys) sortedObj[k] = payload[k];
      entry.current_entry_hash = crypto.createHash("sha256").update(JSON.stringify(sortedObj)).digest("hex");
      fs.writeFileSync(historyPath, existingHistory + "\n" + JSON.stringify(entry) + "\n");

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "AUDIT-003");
      // No implementation_commit_sha, no Phase 1 fields → AUDIT_REQUIRED (historical pattern)
      assert.strictEqual(task.classification, "AUDIT_REQUIRED");
    });

    it("classifies task with declared file absent from impl sha as INVALID_COMPLETION", () => {
      setupAuditFixture([{
        id: "AUDIT-004", title: "Missing File", description: "File gone", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["nonexistent/file.js"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: "0000000000000000000000000000000000000000",
        clean_validation_commit_sha: "0000000000000000000000000000000000000000",
        completion_record_commit_sha: "0000000000000000000000000000000000000000",
        validation_results: { passed: true, implementation_commit_sha: "0000000000000000000000000000000000000000", timestamp: "2026-07-31T00:00:00Z" }
      }]);

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "AUDIT-004");
      assert.strictEqual(task.classification, "INVALID_COMPLETION");
      assert.ok(task.reasons.some(r => r.includes("declared_files_exist_at_impl_sha")));
    });

    it("classifies task with failed validation as INVALID_COMPLETION", () => {
      const sha = execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
      setupAuditFixture([{
        id: "AUDIT-005", title: "Failed Val", description: "Validation failed", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["docs/architecture/ledger/tasks.json"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: false, overallStatus: "FAILED", implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync("git config user.name \"Test\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.email \"test@test.com\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync("git commit -m \"init\"", { cwd: tmpDir, stdio: "pipe" });

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "AUDIT-005");
      assert.strictEqual(task.classification, "INVALID_COMPLETION");
      assert.ok(task.reasons.some(r => r.includes("validation_results_passed")));
    });

    it("excludes non-completed tasks from audit", () => {
      setupAuditFixture([{
        id: "AUDIT-006", title: "Not Done", description: "In progress", severity: "HIGH",
        status: "in_progress", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "",
        changed_files: [], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: "2026-07-29T00:00:00Z", implemented_timestamp: null,
        validated_timestamp: null, completed_timestamp: null, notes: ""
      }]);

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "AUDIT-006");
      assert.strictEqual(task, undefined);
      assert.strictEqual(report.total_completed_tasks, 1);
    });

    it("produces deterministic output on repeated runs", () => {
      setupAuditFixture();
      const report1 = runAudit();
      const report2 = runAudit();
      // Strip timestamps and counts that may vary
      const strip = (r) => ({ ...r, generated_at: null, counts: r.counts, tasks: r.tasks.map(t => ({ ...t, checks: t.checks })) });
      assert.deepStrictEqual(strip(report1), strip(report2));
    });

    it("does not modify tasks.json", () => {
      const { ledgerDir } = setupAuditFixture();
      const tasksPath = path.join(ledgerDir, 'tasks.json');
      const before = fs.readFileSync(tasksPath, 'utf-8');
      runAudit();
      const after = fs.readFileSync(tasksPath, 'utf-8');
      assert.strictEqual(before, after);
    });

    it("does not modify history.jsonl", () => {
      const { ledgerDir } = setupAuditFixture();
      const historyPath = path.join(ledgerDir, 'history.jsonl');
      const before = fs.readFileSync(historyPath, 'utf-8');
      runAudit();
      const after = fs.readFileSync(historyPath, 'utf-8');
      assert.strictEqual(before, after);
    });

    it("history hash chain remains unchanged after audit", () => {
      setupAuditFixture();
      const before = execSync(`node ${CLI_PATH} doctor`, { cwd: tmpDir, encoding: 'utf-8' });
      runAudit();
      const after = execSync(`node ${CLI_PATH} doctor`, { cwd: tmpDir, encoding: 'utf-8' });
      assert.match(before, /healthy/);
      assert.match(after, /healthy/);
    });

    it("clean-validation SHA mismatch is INVALID_COMPLETION", () => {
      const sha = execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
      setupAuditFixture([{
        id: "AUDIT-007", title: "Mismatch SHA", description: "Clean val sha mismatch", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["docs/architecture/ledger/tasks.json"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha,
        clean_validation_commit_sha: "0000000000000000000000000000000000000000",
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync("git config user.name \"Test\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.email \"test@test.com\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync("git commit -m \"init\"", { cwd: tmpDir, stdio: "pipe" });

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "AUDIT-007");
      assert.strictEqual(task.classification, "INVALID_COMPLETION");
      assert.ok(task.reasons.some(r => r.includes("clean_validation_sha_matches")));
    });

    it("completion-record commit missing is AUDIT_REQUIRED for modern task", () => {
      // Init git repo in tmpDir first
      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync("git config user.name \"Test\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git config user.email \"test@test.com\"", { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      fs.writeFileSync(path.join(tmpDir, "placeholder.txt"), "init");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync("git commit -m \"init\"", { cwd: tmpDir, stdio: "pipe" });
      const sha = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();

      setupAuditFixture([{
        id: "AUDIT-008", title: "No Comp SHA", description: "Missing completion sha", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["placeholder.txt"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: null,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      // Add history entry for AUDIT-008
      const ledgerDir = path.join(tmpDir, "docs", "architecture", "ledger");
      const historyPath = path.join(ledgerDir, "history.jsonl");
      const existingHistory = fs.readFileSync(historyPath, "utf-8").trim();
      const entry = {
        timestamp: "2026-07-31T00:00:00Z", task_id: "AUDIT-008",
        previous_status: "validated", new_status: "completed",
        reason: "Completed", evidence_summary: "Done",
        branch: "test", actor: "test",
        previous_entry_hash: "0".repeat(64)
      };
      const payload = { timestamp: entry.timestamp, task_id: entry.task_id,
        previous_status: entry.previous_status, new_status: entry.new_status,
        reason: entry.reason, evidence_summary: entry.evidence_summary,
        branch: entry.branch, actor: entry.actor,
        previous_entry_hash: entry.previous_entry_hash };
      const sortedKeys = Object.keys(payload).sort();
      const sortedObj = {};
      for (const k of sortedKeys) sortedObj[k] = payload[k];
      entry.current_entry_hash = crypto.createHash("sha256").update(JSON.stringify(sortedObj)).digest("hex");
      fs.writeFileSync(historyPath, existingHistory + "\n" + JSON.stringify(entry) + "\n");

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "AUDIT-008");
      // completion_record_commit_sha is null but has other Phase 1 fields → AUDIT_REQUIRED (missing metadata)
      assert.strictEqual(task.classification, "AUDIT_REQUIRED");
    });

    it("audit report has correct JSON structure", () => {
      setupAuditFixture();
      const report = runAudit();
      assert.ok(report.generated_at);
      assert.ok(typeof report.ledger_commit_sha === "string");
      assert.ok(typeof report.total_completed_tasks === "number");
      assert.ok(typeof report.counts.PASS === "number");
      assert.ok(typeof report.counts.AUDIT_REQUIRED === "number");
      assert.ok(typeof report.counts.INVALID_COMPLETION === "number");
      assert.ok(Array.isArray(report.tasks));
      assert.ok(typeof report.report_content_hash === "string");
      assert.strictEqual(report.report_content_hash.length, 64);
      for (const t of report.tasks) {
        assert.ok(typeof t.id === "string");
        assert.ok(["PASS", "AUDIT_REQUIRED", "INVALID_COMPLETION"].includes(t.classification));
        assert.ok(Array.isArray(t.reasons));
        assert.ok(Array.isArray(t.declared_files));
        assert.ok(typeof t.checks === "object");
      }
    });

    // --- Path resolution tests ---

    it("application-relative path resolves to repository-relative Git path", () => {
      // The CLI runs from tmpDir, which acts as the app directory.
      // When a task declares "server/src/routes/api.js", the audit should
      // resolve it to "shopify-product-sorter/server/src/routes/api.js"
      // when the git prefix is "shopify-product-sorter/".
      // This is tested indirectly: a file present at the prefixed path
      // should pass the check, even though it wouldn't exist without the prefix.
      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: "pipe" });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b shopify-product-sorter", { cwd: tmpDir, stdio: "pipe" });
      // Create the file at the correct relative location
      fs.mkdirSync(path.join(tmpDir, "server", "src", "routes"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "server", "src", "routes", "api.js"), "// api");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tmpDir, stdio: "pipe" });
      const sha = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();

      setupAuditFixture([{
        id: "PATH-001", title: "Path Test", description: "Test path resolution", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["server/src/routes/api.js"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "PATH-001");
      assert.strictEqual(task.checks.declared_files_exist_at_impl_sha.passed, true,
        "File should be found via path resolution, not reported as missing");
    });

    it("path already prefixed with shopify-product-sorter/ is not double-prefixed", () => {
      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: "pipe" });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b shopify-product-sorter", { cwd: tmpDir, stdio: "pipe" });
      fs.mkdirSync(path.join(tmpDir, "server", "src"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "server", "src", "app.js"), "// app");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tmpDir, stdio: "pipe" });
      const sha = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();

      setupAuditFixture([{
        id: "PATH-002", title: "Double Prefix Test", description: "Test no double prefix", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        // Already has the prefix — should not become "shopify-product-sorter/shopify-product-sorter/server/..."
        changed_files: ["shopify-product-sorter/server/src/app.js"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "PATH-002");
      assert.strictEqual(task.checks.declared_files_exist_at_impl_sha.passed, true,
        "Already-prefixed path should not be double-prefixed");
    });

    it("absolute paths are rejected", () => {
      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: "pipe" });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      fs.writeFileSync(path.join(tmpDir, "placeholder.txt"), "init");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tmpDir, stdio: "pipe" });
      const sha = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();

      setupAuditFixture([{
        id: "PATH-003", title: "Absolute Path Test", description: "Test absolute path rejection", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["/etc/passwd"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "PATH-003");
      assert.strictEqual(task.checks.declared_files_exist_at_impl_sha.passed, false);
      assert.ok(task.checks.declared_files_exist_at_impl_sha.detail.includes("INVALID_REPOSITORY_PATH"));
    });

    it("parent traversal paths are rejected", () => {
      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: "pipe" });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      fs.writeFileSync(path.join(tmpDir, "placeholder.txt"), "init");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tmpDir, stdio: "pipe" });
      const sha = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();

      setupAuditFixture([{
        id: "PATH-004", title: "Traversal Test", description: "Test traversal rejection", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["../etc/passwd"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "PATH-004");
      assert.strictEqual(task.checks.declared_files_exist_at_impl_sha.passed, false);
      assert.ok(task.checks.declared_files_exist_at_impl_sha.detail.includes("INVALID_REPOSITORY_PATH"));
    });

    it("declared file present at shopify-product-sorter/server/... passes", () => {
      // This is the core path-resolution test: the file exists at the
      // prefixed path in git, and the audit should find it.
      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: "pipe" });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b shopify-product-sorter", { cwd: tmpDir, stdio: "pipe" });
      fs.mkdirSync(path.join(tmpDir, "server", "src"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "server", "src", "app.js"), "// app");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tmpDir, stdio: "pipe" });
      const sha = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();

      setupAuditFixture([{
        id: "PATH-005", title: "Prefix Exists Test", description: "File exists at prefixed path", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["server/src/app.js"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      const report = runAudit({ push: false });
      const task = report.tasks.find(t => t.id === "PATH-005");
      assert.strictEqual(task.checks.declared_files_exist_at_impl_sha.passed, true);
    });

    it("genuinely absent file fails", () => {
      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: "pipe" });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b shopify-product-sorter", { cwd: tmpDir, stdio: "pipe" });
      fs.writeFileSync(path.join(tmpDir, "placeholder.txt"), "init");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tmpDir, stdio: "pipe" });
      const sha = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();

      setupAuditFixture([{
        id: "PATH-006", title: "Missing File Test", description: "File genuinely absent", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["server/src/nonexistent.js"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "PATH-006");
      assert.strictEqual(task.checks.declared_files_exist_at_impl_sha.passed, false);
      assert.ok(task.checks.declared_files_exist_at_impl_sha.detail.includes("FILE_NOT_PRESENT_AT_SHA"));
    });

    // --- Remote containment tests ---

    it("empty git branch -r --contains output returns false", () => {
      // Create a commit on a local-only branch not pushed to any remote
      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: "pipe" });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b main", { cwd: tmpDir, stdio: "pipe" });
      fs.writeFileSync(path.join(tmpDir, "placeholder.txt"), "init");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tmpDir, stdio: "pipe" });
      const sha = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();

      // This SHA exists locally but has no remote refs
      // We can't easily test shaExistsOnOrigin directly, but we can verify
      // the audit correctly classifies a task with a local-only SHA
      setupAuditFixture([{
        id: "REMOTE-001", title: "Local Only SHA", description: "SHA only local", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["placeholder.txt"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      const report = runAudit({ push: false });
      const task = report.tasks.find(t => t.id === "REMOTE-001");
      // The SHA exists locally but not on any remote, so implementation_sha_exists_on_remote should fail
      assert.strictEqual(task.checks.implementation_sha_exists_on_remote.passed, false);
    });

    it("matching remote branch returns true", () => {
      // Use a SHA from the real repo that is on the architecture branch
      const sha = execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf-8" }).trim();
      setupAuditFixture([{
        id: "REMOTE-002", title: "Remote Branch Test", description: "SHA on remote branch", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: [], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "REMOTE-002");
      assert.strictEqual(task.checks.implementation_sha_exists_on_remote.passed, true);
    });

    // --- Deterministic output test ---

    it("repeated normalized audit output is deterministic", () => {
      setupAuditFixture();
      const report1 = runAudit();
      const report2 = runAudit();
      // Compare everything except generated_at
      assert.strictEqual(report1.ledger_commit_sha, report2.ledger_commit_sha);
      assert.strictEqual(report1.total_completed_tasks, report2.total_completed_tasks);
      assert.deepStrictEqual(report1.counts, report2.counts);
      assert.strictEqual(report1.report_content_hash, report2.report_content_hash);
      // Task order and content must be identical
      for (let i = 0; i < report1.tasks.length; i++) {
        assert.strictEqual(report1.tasks[i].id, report2.tasks[i].id);
        assert.strictEqual(report1.tasks[i].classification, report2.tasks[i].classification);
        assert.deepStrictEqual(report1.tasks[i].reasons, report2.tasks[i].reasons);
        assert.deepStrictEqual(report1.tasks[i].checks, report2.tasks[i].checks);
      }
    });

    // --- Path-prefix false positive removal test ---

    it("path-prefix false positives are not classified as INVALID_COMPLETION", () => {
      // This tests the core fix: files that exist at the prefixed path
      // should NOT be classified as INVALID_COMPLETION.
      // We simulate the exact scenario that caused the 13 false positives:
      // a task declares "server/src/routes/sorter.js" and the file exists
      // at "shopify-product-sorter/server/src/routes/sorter.js" in git.
      execSync("git init", { cwd: auditGitRoot, stdio: "pipe" });
      execSync('git config user.name "Test"', { cwd: tmpDir, stdio: "pipe" });
      execSync('git config user.email "test@test.com"', { cwd: tmpDir, stdio: "pipe" });
      execSync("git checkout -b shopify-product-sorter", { cwd: tmpDir, stdio: "pipe" });
      fs.mkdirSync(path.join(tmpDir, "server", "src", "routes"), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, "server", "src", "routes", "sorter.js"), "// sorter");
      execSync("git add .", { cwd: tmpDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tmpDir, stdio: "pipe" });
      const sha = execSync("git rev-parse HEAD", { cwd: tmpDir, encoding: "utf-8" }).trim();

      setupAuditFixture([{
        id: "PREFIX-001", title: "Prefix False Positive", description: "Simulates the false positive scenario", severity: "HIGH",
        status: "completed", dependencies: [], blocking_reasons: [],
        acceptance_criteria: ["Pass"], validation_commands: [], evidence: "Done",
        changed_files: ["server/src/routes/sorter.js"], validation_files: [],
        created_timestamp: "2026-07-29T00:00:00Z", updated_timestamp: "2026-07-31T00:00:00Z",
        started_timestamp: null, implemented_timestamp: null, validated_timestamp: null,
        completed_timestamp: "2026-07-31T00:00:00Z", notes: "",
        implementation_commit_sha: sha, clean_validation_commit_sha: sha,
        completion_record_commit_sha: sha,
        validation_results: { passed: true, implementation_commit_sha: sha, timestamp: "2026-07-31T00:00:00Z" }
      }]);

      const report = runAudit();
      const task = report.tasks.find(t => t.id === "PREFIX-001");
      assert.strictEqual(task.checks.declared_files_exist_at_impl_sha.passed, true,
        "Path-prefix mismatch should not report the declared file as missing");
    });

    // --- Audit read-only tests (reinforced) ---

    it("audit does not modify tasks.json (reinforced)", () => {
      const { ledgerDir } = setupAuditFixture();
      const tasksPath = path.join(ledgerDir, 'tasks.json');
      const before = fs.readFileSync(tasksPath, 'utf-8');
      const beforeHash = crypto.createHash('sha256').update(before).digest('hex');
      runAudit();
      const after = fs.readFileSync(tasksPath, 'utf-8');
      const afterHash = crypto.createHash('sha256').update(after).digest('hex');
      assert.strictEqual(beforeHash, afterHash);
    });

    it("audit does not modify history.jsonl (reinforced)", () => {
      const { ledgerDir } = setupAuditFixture();
      const historyPath = path.join(ledgerDir, 'history.jsonl');
      const before = fs.readFileSync(historyPath, 'utf-8');
      const beforeHash = crypto.createHash('sha256').update(before).digest('hex');
      runAudit();
      const after = fs.readFileSync(historyPath, 'utf-8');
      const afterHash = crypto.createHash('sha256').update(after).digest('hex');
      assert.strictEqual(beforeHash, afterHash);
    });
  });

});
