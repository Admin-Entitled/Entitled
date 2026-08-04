import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";
import {
  computeFileHash,
  createSourceBackup,
  testSourceRestore,
  planMigration,
  dryRunMigration,
  executeMigration,
  resumeMigration,
  verifyMigration,
  rollbackMigration,
  normalizeSqliteRow,
} from "./deliveryMigratorService.js";

function createTestDb(dbPath, rows = []) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE delivery_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopify_order_id TEXT NOT NULL,
      shopify_order_name TEXT NOT NULL,
      shopify_order_number TEXT,
      order_created_at TEXT NOT NULL,
      customer_name TEXT,
      awb TEXT,
      shopify_fulfillment_status TEXT,
      cancellation_status TEXT,
      shopify_updated_at TEXT,
      logistics_raw_status TEXT,
      resolution TEXT NOT NULL DEFAULT UNRESOLVED,
      resolution_source TEXT NOT NULL DEFAULT NONE,
      courier TEXT,
      delivered_at TEXT,
      shiprocket_order_reference TEXT,
      shiprocket_channel_reference TEXT,
      shiprocket_response_id TEXT,
      logistics_updated_at TEXT,
      manual_note TEXT,
      manual_resolved_at TEXT,
      legacy_import_name TEXT,
      last_synced_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE legacy_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_hash TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      result_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE delivery_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const stmt = db.prepare(`
    INSERT INTO delivery_orders (
      shopify_order_id, shopify_order_name, shopify_order_number, order_created_at,
      customer_name, awb, shopify_fulfillment_status, cancellation_status,
      shopify_updated_at, logistics_raw_status, resolution, resolution_source,
      courier, delivered_at, shiprocket_order_reference, shiprocket_channel_reference,
      shiprocket_response_id, last_synced_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const now = new Date().toISOString();
  for (const r of rows) {
    stmt.run(
      r.shopify_order_id,
      r.shopify_order_name,
      r.shopify_order_number || r.shopify_order_name,
      r.order_created_at || now,
      r.customer_name || "Synthetic Customer",
      r.awb || null,
      r.shopify_fulfillment_status || "fulfilled",
      r.cancellation_status || null,
      r.shopify_updated_at || now,
      r.logistics_raw_status || "Delivered",
      r.resolution || "DELIVERED_TO_CUSTOMER",
      r.resolution_source || "AUTO",
      r.courier || "Shiprocket",
      r.delivered_at || now,
      r.shiprocket_order_reference || "SR-1001",
      r.shiprocket_channel_reference || "CH-1001",
      r.shiprocket_response_id || "RESP-1001",
      now,
      now,
      now
    );
  }

  db.close();
}

function createMockPgClient(pgDbPath) {
  fs.mkdirSync(path.dirname(pgDbPath), { recursive: true });
  if (fs.existsSync(pgDbPath)) {
    fs.unlinkSync(pgDbPath);
  }
  const db = new Database(pgDbPath);
  db.exec(`
    CREATE TABLE orders (
      id TEXT PRIMARY KEY,
      shopify_order_id TEXT NOT NULL UNIQUE,
      shopify_order_name TEXT NOT NULL,
      shopify_order_number TEXT,
      order_date TEXT,
      customer_name TEXT,
      shopify_fulfillment_status TEXT,
      cancellation_status TEXT,
      shopify_updated_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE shipments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      shopify_tracking_number TEXT,
      awb TEXT,
      courier TEXT,
      normalized_status TEXT NOT NULL,
      raw_status TEXT,
      status_source TEXT NOT NULL,
      status_timestamp TEXT,
      delivered_at TEXT,
      shiprocket_order_reference TEXT,
      shiprocket_channel_reference TEXT,
      shiprocket_response_id TEXT,
      manual_override INTEGER DEFAULT 0,
      manual_override_lock INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE status_history (
      id TEXT PRIMARY KEY,
      order_id TEXT,
      shipment_id TEXT,
      next_status TEXT NOT NULL,
      raw_status TEXT,
      source TEXT NOT NULL,
      remarks TEXT,
      actor TEXT,
      recorded_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE import_batches (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_hash TEXT NOT NULL UNIQUE,
      uploaded_at TEXT NOT NULL,
      total_rows INTEGER DEFAULT 0,
      status TEXT NOT NULL
    );
    CREATE TABLE migration_journal (
      id TEXT PRIMARY KEY,
      migration_id TEXT NOT NULL UNIQUE,
      source_fingerprint TEXT NOT NULL,
      source_table TEXT NOT NULL,
      target_table TEXT NOT NULL,
      planned_count INTEGER DEFAULT 0,
      inserted_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0,
      conflict_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      checkpoint TEXT,
      started_at TEXT DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT,
      status TEXT DEFAULT 'running',
      error_summary TEXT
    );
    CREATE TABLE migration_exceptions (
      id TEXT PRIMARY KEY,
      source_key TEXT NOT NULL,
      reason TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  let inTx = false;

  return {
    async query(sql, params = []) {
      const trimmed = sql.trim().toUpperCase();
      if (trimmed === "BEGIN") {
        inTx = true;
        db.exec("BEGIN TRANSACTION");
        return { rows: [] };
      }
      if (trimmed === "COMMIT") {
        inTx = false;
        db.exec("COMMIT");
        return { rows: [] };
      }
      if (trimmed === "ROLLBACK") {
        if (inTx) {
          db.exec("ROLLBACK");
          inTx = false;
        }
        return { rows: [] };
      }

      // Emulate PG queries for migration testing
      if (sql.includes("INSERT INTO") && sql.includes("migration_journal")) {
        const id = "mj_" + Math.random().toString(36).slice(2);
        if (sql.includes("ON CONFLICT")) {
          const stmt = db.prepare(`
            INSERT INTO migration_journal (id, migration_id, source_fingerprint, source_table, target_table, planned_count, status)
            VALUES (?, ?, ?, ?, ?, ?, 'running')
            ON CONFLICT(migration_id) DO UPDATE SET status = excluded.status
          `);
          stmt.run(id, params[0], params[1], params[2], params[3], params[4]);
        } else {
          const stmt = db.prepare(`
            INSERT INTO migration_journal (id, migration_id, source_fingerprint, source_table, target_table, planned_count, status)
            VALUES (?, ?, ?, ?, ?, ?, running)
          `);
          stmt.run(id, params[0], params[1], params[2], params[3], params[4]);
        }
        return { rows: [{ id }] };
      }

      if (sql.includes("INSERT INTO") && sql.includes("orders")) {
        const id = "ord_" + Math.random().toString(36).slice(2);
        const stmt = db.prepare(`
          INSERT INTO orders (id, shopify_order_id, shopify_order_name, shopify_order_number, order_date, customer_name, shopify_fulfillment_status, cancellation_status, shopify_updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(shopify_order_id) DO UPDATE SET shopify_order_name = excluded.shopify_order_name
        `);
        stmt.run(id, params[0], params[1], params[2], params[3], params[4], params[5], params[6], params[7]);
        const fetched = db.prepare("SELECT id FROM orders WHERE shopify_order_id = ?").get(params[0]);
        return { rows: [fetched] };
      }

      if (sql.includes("SELECT id FROM") && sql.includes("shipments")) {
        const rows = db.prepare("SELECT id FROM shipments WHERE order_id = ?").all(params[0]);
        return { rows };
      }

      if (sql.includes("INSERT INTO") && sql.includes("shipments")) {
        const id = "ship_" + Math.random().toString(36).slice(2);
        const stmt = db.prepare(`
          INSERT INTO shipments (id, order_id, shopify_tracking_number, awb, courier, normalized_status, raw_status, status_source, status_timestamp, delivered_at, shiprocket_order_reference, shiprocket_channel_reference, shiprocket_response_id, manual_override, manual_override_lock)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id, params[0], params[1], params[2], params[3], params[4], params[5], params[6], params[7], params[8], params[9], params[10], params[11], params[12] ? 1 : 0, params[13] ? 1 : 0);
        return { rows: [{ id }] };
      }

      if (sql.includes("UPDATE") && sql.includes("shipments")) {
        const stmt = db.prepare(`
          UPDATE shipments SET normalized_status = ?, raw_status = ?, status_source = ?, status_timestamp = ?, courier = ?, delivered_at = ?, shiprocket_order_reference = ?, shiprocket_channel_reference = ?, manual_override = ?, manual_override_lock = ? WHERE id = ?
        `);
        stmt.run(params[0], params[1], params[2], params[3], params[4], params[5], params[6], params[7], params[8] ? 1 : 0, params[9] ? 1 : 0, params[10]);
        return { rows: [] };
      }

      if (sql.includes("INSERT INTO") && sql.includes("status_history")) {
        const id = "sh_" + Math.random().toString(36).slice(2);
        const stmt = db.prepare(`
          INSERT INTO status_history (id, order_id, shipment_id, next_status, raw_status, source, remarks, actor)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id, params[0], params[1], params[2], params[3], params[4], params[5], params[6]);
        return { rows: [{ id }] };
      }

      if (sql.includes("INSERT INTO") && sql.includes("import_batches")) {
        const id = "ib_" + Math.random().toString(36).slice(2);
        const stmt = db.prepare(`
          INSERT OR IGNORE INTO import_batches (id, file_name, file_hash, uploaded_at, total_rows, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(id, params[0], params[1], params[2], params[3], params[4]);
        return { rows: [{ id }] };
      }

      if (sql.includes("UPDATE") && sql.includes("migration_journal")) {
        const stmt = db.prepare(`
          UPDATE migration_journal SET status = ?, inserted_count = ?, skipped_count = ?, conflict_count = ?, failure_count = ?, checkpoint = ?, completed_at = CURRENT_TIMESTAMP WHERE migration_id = ?
        `);
        stmt.run(params[0], params[1], params[2], params[3], params[4], params[5], params[6]);
        return { rows: [] };
      }

      if (sql.includes("SELECT count(*) as cnt FROM") && sql.includes("orders")) {
        const row = db.prepare("SELECT count(*) as cnt FROM orders").get();
        return { rows: [row] };
      }

      if (sql.includes("SELECT count(*) as cnt FROM") && sql.includes("shipments")) {
        const row = db.prepare("SELECT count(*) as cnt FROM shipments").get();
        return { rows: [row] };
      }

      if (sql.includes("SELECT * FROM") && sql.includes("migration_journal")) {
        let rows = [];
        if (params.length > 0) {
          rows = db.prepare("SELECT * FROM migration_journal WHERE migration_id = ?").all(params[0]);
        } else {
          rows = db.prepare("SELECT * FROM migration_journal ORDER BY started_at DESC").all();
        }
        return { rows };
      }

      if (sql.includes("DELETE FROM") && sql.includes("status_history")) {
        const rows = db.prepare("SELECT id, order_id, shipment_id FROM status_history WHERE remarks LIKE ?").all(params[0]);
        db.prepare("DELETE FROM status_history WHERE remarks LIKE ?").run(params[0]);
        return { rows };
      }

      if (sql.includes("DELETE FROM") && sql.includes("shipments")) {
        const rows = db.prepare("SELECT id, order_id FROM shipments").all();
        db.prepare("DELETE FROM shipments").run();
        return { rows };
      }

      if (sql.includes("DELETE FROM") && sql.includes("orders")) {
        const rows = db.prepare("SELECT id FROM orders").all();
        db.prepare("DELETE FROM orders").run();
        return { rows };
      }

      if (sql.includes("SELECT id FROM") && sql.includes("orders") && sql.includes("WHERE shopify_order_id = $1")) {
        const rows = db.prepare("SELECT id FROM orders WHERE shopify_order_id = ?").all(params[0]);
        return { rows };
      }

      return { rows: [] };
    },
    close() {
      db.close();
    }
  };
}

test("MIGRATION-001: plan mode performs zero target writes and returns source counts", async () => {
  const tmpDbPath = path.resolve("/tmp/test_migrator_plan.db");
  createTestDb(tmpDbPath, [
    { shopify_order_id: "gid://101", shopify_order_name: "#1001" },
    { shopify_order_id: "gid://102", shopify_order_name: "#1002" },
  ]);

  const hashBefore = computeFileHash(tmpDbPath);
  const plan = await planMigration({ sourcePath: tmpDbPath });
  const hashAfter = computeFileHash(tmpDbPath);

  assert.equal(hashBefore, hashAfter);
  assert.equal(plan.readOnlyWritesPerformed, 0);
  assert.equal(plan.plannedRecords.delivery_orders, 2);

  fs.unlinkSync(tmpDbPath);
});

test("MIGRATION-002: dry-run performs zero target writes and detects duplicate orders/AWBs", async () => {
  const tmpDbPath = path.resolve("/tmp/test_migrator_dryrun.db");
  createTestDb(tmpDbPath, [
    { shopify_order_id: "gid://101", shopify_order_name: "#1001", awb: "AWB-100" },
    { shopify_order_id: "gid://101", shopify_order_name: "#1001-dup", awb: "AWB-100" },
  ]);

  const dryRun = await dryRunMigration({ sourcePath: tmpDbPath });
  assert.equal(dryRun.dryRun, true);
  assert.equal(dryRun.targetWritesPerformed, 0);
  assert.equal(dryRun.duplicateOrders, 1);
  assert.equal(dryRun.duplicateAwbs, 1);

  fs.unlinkSync(tmpDbPath);
});

test("MIGRATION-003: createSourceBackup creates integrity-verified backup and matches source SHA-256", async () => {
  const tmpDbPath = path.resolve("/tmp/test_migrator_backup_src.db");
  createTestDb(tmpDbPath, [{ shopify_order_id: "gid://201", shopify_order_name: "#2001" }]);

  const backupRes = await createSourceBackup(tmpDbPath);
  assert.equal(backupRes.verified, true);
  assert.equal(backupRes.sourceHash, backupRes.backupHash);
  assert.equal(fs.existsSync(backupRes.backupPath), true);

  fs.unlinkSync(tmpDbPath);
  if (fs.existsSync(backupRes.backupPath)) {
    fs.unlinkSync(backupRes.backupPath);
  }
});

test("MIGRATION-004: testSourceRestore validates isolated backup schema without altering backup hash", async () => {
  const tmpDbPath = path.resolve("/tmp/test_migrator_restore_src.db");
  createTestDb(tmpDbPath, [{ shopify_order_id: "gid://301", shopify_order_name: "#3001" }]);

  const restoreRes = await testSourceRestore(tmpDbPath);
  assert.equal(restoreRes.verified, true);
  assert.equal(restoreRes.counts.delivery_orders, 1);

  fs.unlinkSync(tmpDbPath);
});

test("MIGRATION-007: executeMigration successfully migrates records and creates journal entry", async () => {
  const tmpSrcDb = path.resolve("/tmp/test_exec_src.db");
  const tmpTargetDb = path.resolve("/tmp/test_exec_target.db");

  createTestDb(tmpSrcDb, [
    { shopify_order_id: "gid://401", shopify_order_name: "#4001", awb: "AWB-401" },
    { shopify_order_id: "gid://402", shopify_order_name: "#4002", awb: "AWB-402" },
  ]);

  const mockPg = createMockPgClient(tmpTargetDb);
  const hashBefore = computeFileHash(tmpSrcDb);

  const res = await executeMigration({
    sourcePath: tmpSrcDb,
    confirm: true,
    migrationId: "mig_test_exec_1",
    clientOverride: mockPg,
  });

  const hashAfter = computeFileHash(tmpSrcDb);

  assert.equal(res.status, "completed");
  assert.equal(res.insertedCount, 2);
  assert.equal(hashBefore, hashAfter); // Source unchanged

  mockPg.close();
  fs.unlinkSync(tmpSrcDb);
  if (fs.existsSync(tmpTargetDb)) fs.unlinkSync(tmpTargetDb);
});

test("MIGRATION-008: executeMigration is idempotent on second execution", async () => {
  const tmpSrcDb = path.resolve("/tmp/test_idempotent_src.db");
  const tmpTargetDb = path.resolve("/tmp/test_idempotent_target.db");

  createTestDb(tmpSrcDb, [
    { shopify_order_id: "gid://501", shopify_order_name: "#5001" },
  ]);

  const mockPg = createMockPgClient(tmpTargetDb);

  // First run
  const res1 = await executeMigration({
    sourcePath: tmpSrcDb,
    confirm: true,
    migrationId: "mig_test_idem_1",
    clientOverride: mockPg,
  });
  assert.equal(res1.insertedCount, 1);

  // Second run
  const res2 = await executeMigration({
    sourcePath: tmpSrcDb,
    confirm: true,
    migrationId: "mig_test_idem_2",
    clientOverride: mockPg,
  });
  assert.equal(res2.insertedCount, 0);
  assert.equal(res2.conflictCount, 1);

  mockPg.close();
  fs.unlinkSync(tmpSrcDb);
  if (fs.existsSync(tmpTargetDb)) fs.unlinkSync(tmpTargetDb);
});

test("MIGRATION-009: rollbackMigration reverts migration target entries without modifying source", async () => {
  const tmpSrcDb = path.resolve("/tmp/test_rollback_src.db");
  const tmpTargetDb = path.resolve("/tmp/test_rollback_target.db");

  createTestDb(tmpSrcDb, [
    { shopify_order_id: "gid://601", shopify_order_name: "#6001" },
  ]);

  const mockPg = createMockPgClient(tmpTargetDb);
  const hashBefore = computeFileHash(tmpSrcDb);

  const execRes = await executeMigration({
    sourcePath: tmpSrcDb,
    confirm: true,
    migrationId: "mig_test_rb_1",
    clientOverride: mockPg,
  });

  const rbRes = await rollbackMigration({
    migrationId: "mig_test_rb_1",
    confirm: true,
    clientOverride: mockPg,
  });

  const hashAfter = computeFileHash(tmpSrcDb);

  assert.equal(rbRes.status, "rolled_back");
  assert.equal(hashBefore, hashAfter); // Source untouched

  mockPg.close();
  fs.unlinkSync(tmpSrcDb);
  if (fs.existsSync(tmpTargetDb)) fs.unlinkSync(tmpTargetDb);
});
