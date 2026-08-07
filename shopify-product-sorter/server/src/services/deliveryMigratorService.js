import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { env } from "../config/env.js";
import { runOrderMappingMigrations } from "./orderMappingMigrations.js";
import { orderMappingQuery, withOrderMappingClient } from "./orderMappingDb.js";
import { normalizeOrderMappingStatus } from "./orderMappingStatus.js";

function sanitizeErrorReason(err) {
  if (!err) return "Unknown database error";
  const msg = String(err.message || err);
  const sanitized = msg
    .replace(/postgres(?:ql)?:\/\/[^\s@]+@[^\s]+/gi, "postgres://[REDACTED]")
    .replace(/password=[^\s;&]+/gi, "password=[REDACTED]");
  return sanitized || "Database query failure";
}

export function computeFileHash(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(content).digest("hex");
}

export function normalizeSqliteRow(row) {
  const normalizedStatus = normalizeOrderMappingStatus(row.resolution || row.logistics_raw_status || "UNRESOLVED");
  const isManual = row.resolution_source === "MANUAL";
  const source = isManual ? "MANUAL" : "LEGACY_SQLITE_IMPORT";
  const statusTimestamp = row.manual_resolved_at || row.logistics_updated_at || row.updated_at || new Date().toISOString();
  return { normalizedStatus, source, statusTimestamp };
}

export async function createSourceBackup(sourcePath = env.sqlitePath) {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Source SQLite file does not exist: ${resolved}`);
  }

  const sourceHash = computeFileHash(resolved);
  const backupsDir = path.join(path.dirname(resolved), "backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  const timestamp = new Date().toISOString().replaceAll(":", "-");
  const backupPath = path.join(backupsDir, `app.db.${timestamp}.bak`);

  fs.copyFileSync(resolved, backupPath);
  const backupHash = computeFileHash(backupPath);

  if (sourceHash !== backupHash) {
    throw new Error("Backup creation failed: SHA-256 hash mismatch");
  }

  const db = new Database(backupPath, { readonly: true });
  try {
    const check = db.prepare("PRAGMA quick_check").get();
    if (!check || check.quick_check !== "ok") {
      throw new Error(`Backup SQLite integrity check failed: ${JSON.stringify(check)}`);
    }
  } finally {
    db.close();
  }

  return {
    sourcePath: resolved,
    backupPath,
    sourceHash,
    backupHash,
    verified: true,
    timestamp: new Date().toISOString(),
  };
}

export async function testSourceRestore(backupPath) {
  const resolved = path.resolve(backupPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Backup file does not exist: ${resolved}`);
  }

  const initialHash = computeFileHash(resolved);
  const tempDir = path.join("/tmp", "delivery-migrator-restore-check");
  fs.mkdirSync(tempDir, { recursive: true });
  const tempDbPath = path.join(tempDir, `restore_${Date.now()}.db`);

  fs.copyFileSync(resolved, tempDbPath);

  let tables = [];
  const counts = {};
  try {
    const db = new Database(tempDbPath, { readonly: true });
    tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
    for (const table of tables) {
      const row = db.prepare(`SELECT count(*) as cnt FROM "${table}"`).get();
      counts[table] = row.cnt;
    }
    db.close();
  } finally {
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  }

  const postHash = computeFileHash(resolved);
  if (initialHash !== postHash) {
    throw new Error("Restore test modified original backup file hash");
  }

  return {
    verified: true,
    backupPath: resolved,
    tables,
    counts,
    backupHash: postHash,
  };
}

export async function planMigration({ sourcePath = env.sqlitePath, clientOverride = null } = {}) {
  const resolved = path.resolve(sourcePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Source SQLite file does not exist: ${resolved}`);
  }

  const sourceHash = computeFileHash(resolved);
  const db = new Database(resolved, { readonly: true });
  let deliveryOrdersCount = 0;
  let legacyImportsCount = 0;
  let deliveryLogsCount = 0;

  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((t) => t.name);
    if (tables.includes("delivery_orders")) {
      deliveryOrdersCount = db.prepare("SELECT count(*) as cnt FROM delivery_orders").get().cnt;
    }
    if (tables.includes("legacy_imports")) {
      legacyImportsCount = db.prepare("SELECT count(*) as cnt FROM legacy_imports").get().cnt;
    }
    if (tables.includes("delivery_logs")) {
      deliveryLogsCount = db.prepare("SELECT count(*) as cnt FROM delivery_logs").get().cnt;
    }
  } finally {
    db.close();
  }

  let pgOrdersCount = 0;
  let pgShipmentsCount = 0;
  let pgConfigured = false;
  let pgError = null;

  if (clientOverride || env.databaseUrl) {
    try {
      if (!clientOverride) {
        await runOrderMappingMigrations();
      }
      const query = clientOverride
        ? clientOverride.query.bind(clientOverride)
        : orderMappingQuery;

      const oRes = await query(`SELECT count(*) as cnt FROM "${env.orderMappingSchema}"."orders"`);
      const sRes = await query(`SELECT count(*) as cnt FROM "${env.orderMappingSchema}"."shipments"`);
      pgOrdersCount = Number(oRes.rows[0]?.cnt || 0);
      pgShipmentsCount = Number(sRes.rows[0]?.cnt || 0);
      pgConfigured = true;
    } catch (e) {
      pgConfigured = false;
      pgError = sanitizeErrorReason(e);
    }
  }

  return {
    sourcePath: resolved,
    sourceHash,
    plannedRecords: {
      delivery_orders: deliveryOrdersCount,
      legacy_imports: legacyImportsCount,
      delivery_logs: deliveryLogsCount,
    },
    targetState: {
      pgConfigured,
      existingOrders: pgOrdersCount,
      existingShipments: pgShipmentsCount,
      ...(pgError ? { error: pgError } : {}),
    },
    targetGap: deliveryOrdersCount,
    readOnlyWritesPerformed: 0,
  };
}

export async function dryRunMigration({ sourcePath = env.sqlitePath, clientOverride = null } = {}) {
  const plan = await planMigration({ sourcePath, clientOverride });
  const db = new Database(plan.sourcePath, { readonly: true });

  let validRows = 0;
  let duplicateOrders = 0;
  let duplicateAwbs = 0;
  const seenOrderIds = new Set();
  const seenAwbs = new Set();

  try {
    const rows = db.prepare("SELECT * FROM delivery_orders ORDER BY id").all();
    for (const row of rows) {
      if (!row.shopify_order_id) {
        continue;
      }
      if (seenOrderIds.has(row.shopify_order_id)) {
        duplicateOrders += 1;
      } else {
        seenOrderIds.add(row.shopify_order_id);
      }

      if (row.awb) {
        const trimmed = String(row.awb).trim();
        if (trimmed) {
          if (seenAwbs.has(trimmed)) {
            duplicateAwbs += 1;
          } else {
            seenAwbs.add(trimmed);
          }
        }
      }
      validRows += 1;
    }
  } finally {
    db.close();
  }

  return {
    dryRun: true,
    sourcePath: plan.sourcePath,
    sourceHash: plan.sourceHash,
    totalSourceRows: plan.plannedRecords.delivery_orders,
    validRows,
    uniqueOrders: seenOrderIds.size,
    duplicateOrders,
    duplicateAwbs,
    targetWritesPerformed: 0,
  };
}

export async function executeMigration({ sourcePath = env.sqlitePath, confirm = false, migrationId = null, clientOverride = null } = {}) {
  const hasConfirmFlag = confirm || process.argv.includes("--confirm") || process.argv.includes("--yes");
  const hasConfirmEnv = process.env.CONFIRM_MIGRATION === "true" || process.env.FORCE_MIGRATE === "true";

  if (!hasConfirmFlag && !hasConfirmEnv) {
    throw new Error("Migration execution requires explicit confirmation (--confirm or CONFIRM_MIGRATION=true)");
  }

  if (!clientOverride) {
    await runOrderMappingMigrations();
  }

  const resolvedSource = path.resolve(sourcePath);
  const sourceHash = computeFileHash(resolvedSource);
  const mId = migrationId || `mig_12h_${Date.now()}`;

  const db = new Database(resolvedSource, { readonly: true });
  const rows = db.prepare("SELECT * FROM delivery_orders ORDER BY id").all();
  let legacyImportRows = [];
  try {
    legacyImportRows = db.prepare("SELECT * FROM legacy_imports ORDER BY id").all();
  } catch (e) {
    legacyImportRows = [];
  }
  db.close();

  let insertedCount = 0;
  let skippedCount = 0;
  let conflictCount = 0;
  let failureCount = 0;
  let checkpoint = "0";

  const runWithClient = clientOverride ? (fn) => fn(clientOverride) : withOrderMappingClient;
  await runWithClient(async (client) => {
    await client.query(
      `INSERT INTO "${env.orderMappingSchema}"."migration_journal"
       (migration_id, source_fingerprint, source_table, target_table, planned_count, status)
       VALUES ($1, $2, $3, $4, $5, 'running')
       ON CONFLICT (migration_id) DO UPDATE SET status = 'running'`,
      [mId, sourceHash, "delivery_orders", "orders/shipments", rows.length],
    );

    try {
      await client.query("BEGIN");

      for (const row of rows) {
        checkpoint = String(row.id);
        const shopifyOrderId = String(row.shopify_order_id || "").trim();
        const shopifyOrderName = String(row.shopify_order_name || "").trim();

        if (!shopifyOrderId || !shopifyOrderName) {
          skippedCount += 1;
          continue;
        }

        const normalized = normalizeSqliteRow(row);
        const awbVal = row.awb && String(row.awb).trim() ? String(row.awb).trim() : null;
        const responseIdVal = row.shiprocket_response_id && String(row.shiprocket_response_id).trim() ? String(row.shiprocket_response_id).trim() : null;

        const orderRes = await client.query(
          `INSERT INTO "${env.orderMappingSchema}"."orders"
           (shopify_order_id, shopify_order_name, shopify_order_number, order_date, customer_name, shopify_fulfillment_status, cancellation_status, shopify_updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (shopify_order_id) DO UPDATE SET
             shopify_order_name = EXCLUDED.shopify_order_name,
             updated_at = NOW()
           RETURNING id`,
          [
            shopifyOrderId,
            shopifyOrderName,
            row.shopify_order_number || shopifyOrderName,
            row.order_created_at || new Date().toISOString(),
            row.customer_name || "",
            row.shopify_fulfillment_status || "",
            row.cancellation_status || null,
            row.shopify_updated_at || row.updated_at || new Date().toISOString(),
          ],
        );

        const orderId = orderRes.rows[0].id;

        const existingShipmentRes = await client.query(
          `SELECT id FROM "${env.orderMappingSchema}"."shipments" WHERE order_id = $1`,
          [orderId],
        );

        let shipmentId;
        if (existingShipmentRes.rows.length > 0) {
          shipmentId = existingShipmentRes.rows[0].id;
          conflictCount += 1;
          await client.query(
            `UPDATE "${env.orderMappingSchema}"."shipments" SET
               normalized_status = $1,
               raw_status = $2,
               status_source = $3,
               status_timestamp = $4,
               courier = $5,
               delivered_at = $6,
               shiprocket_order_reference = $7,
               shiprocket_channel_reference = $8,
               manual_override = $9,
               manual_override_lock = $10,
               updated_at = NOW()
             WHERE id = $11`,
            [
              normalized.normalizedStatus,
              row.logistics_raw_status || null,
              normalized.source,
              normalized.statusTimestamp,
              row.courier || null,
              row.delivered_at || null,
              row.shiprocket_order_reference || null,
              row.shiprocket_channel_reference || null,
              row.resolution_source === "MANUAL",
              row.resolution_source === "MANUAL",
              shipmentId,
            ],
          );
        } else {
          const shipRes = await client.query(
            `INSERT INTO "${env.orderMappingSchema}"."shipments"
             (order_id, shopify_tracking_number, awb, courier, normalized_status, raw_status, status_source, status_timestamp, delivered_at, shiprocket_order_reference, shiprocket_channel_reference, shiprocket_response_id, manual_override, manual_override_lock)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
             RETURNING id`,
            [
              orderId,
              awbVal,
              awbVal,
              row.courier || null,
              normalized.normalizedStatus,
              row.logistics_raw_status || null,
              normalized.source,
              normalized.statusTimestamp,
              row.delivered_at || null,
              row.shiprocket_order_reference || null,
              row.shiprocket_channel_reference || null,
              responseIdVal,
              row.resolution_source === "MANUAL",
              row.resolution_source === "MANUAL",
            ],
          );
          shipmentId = shipRes.rows[0].id;
          insertedCount += 1;
        }

        await client.query(
          `INSERT INTO "${env.orderMappingSchema}"."status_history"
           (order_id, shipment_id, next_status, raw_status, source, remarks, actor)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            orderId,
            shipmentId,
            normalized.normalizedStatus,
            row.logistics_raw_status || null,
            normalized.source,
            `${row.manual_note || "Migrated from legacy SQLite"} [mig:${mId}]`,
            "MIGRATION_BOT",
          ],
        );
      }

      for (const imp of legacyImportRows) {
        await client.query(
          `INSERT INTO "${env.orderMappingSchema}"."import_batches"
           (file_name, file_hash, uploaded_at, total_rows, status)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (file_hash) DO NOTHING`,
          [
            imp.filename || "legacy_import.csv",
            imp.content_hash,
            imp.created_at || new Date().toISOString(),
            0,
            "completed",
          ],
        );
      }

      await client.query("COMMIT");

      await client.query(
        `UPDATE "${env.orderMappingSchema}"."migration_journal" SET
           status = 'completed',
           inserted_count = $1,
           skipped_count = $2,
           conflict_count = $3,
           failure_count = $4,
           checkpoint = $5,
           completed_at = NOW()
         WHERE migration_id = $6`,
        [insertedCount, skippedCount, conflictCount, failureCount, checkpoint, mId],
      );
    } catch (error) {
      await client.query("ROLLBACK");
      await client.query(
        `UPDATE "${env.orderMappingSchema}"."migration_journal" SET
           status = 'failed',
           error_summary = $1,
           checkpoint = $2,
           completed_at = NOW()
         WHERE migration_id = $3`,
        [error.message, checkpoint, mId],
      );

      await client.query(
        `INSERT INTO "${env.orderMappingSchema}"."migration_exceptions"
         (source_key, reason, payload) VALUES ($1, $2, $3)`,
        [mId, error.message, JSON.stringify({ checkpoint, sourcePath })],
      );

      throw error;
    }
  });

  return {
    migrationId: mId,
    status: "completed",
    sourceHash,
    planned: rows.length,
    insertedCount,
    skippedCount,
    conflictCount,
    failureCount,
  };
}

export async function resumeMigration({ sourcePath = env.sqlitePath, confirm = false, migrationId = null, clientOverride = null } = {}) {
  const hasConfirmFlag = confirm || process.argv.includes("--confirm") || process.argv.includes("--yes");
  const hasConfirmEnv = process.env.CONFIRM_MIGRATION === "true" || process.env.FORCE_MIGRATE === "true";

  if (!hasConfirmFlag && !hasConfirmEnv) {
    throw new Error("Migration resume requires explicit confirmation (--confirm or CONFIRM_MIGRATION=true)");
  }

  if (!clientOverride) {
    await runOrderMappingMigrations();
  }
  const resolvedSource = path.resolve(sourcePath);
  const currentHash = computeFileHash(resolvedSource);

  const runWithClient = clientOverride ? (fn) => fn(clientOverride) : withOrderMappingClient;
  let journalRow;
  await runWithClient(async (client) => {
    if (migrationId) {
      const res = await client.query(
        `SELECT * FROM "${env.orderMappingSchema}"."migration_journal" WHERE migration_id = $1`,
        [migrationId],
      );
      journalRow = res.rows[0];
    } else {
      const res = await client.query(
        `SELECT * FROM "${env.orderMappingSchema}"."migration_journal" WHERE status IN ('running', 'failed') ORDER BY started_at DESC LIMIT 1`,
      );
      journalRow = res.rows[0];
    }
  });

  if (!journalRow) {
    return executeMigration({ sourcePath: resolvedSource, confirm: true, migrationId, clientOverride });
  }

  if (journalRow.source_fingerprint !== currentHash) {
    throw new Error("Source fingerprint mismatch rejects resume");
  }

  return executeMigration({ sourcePath: resolvedSource, confirm: true, migrationId: journalRow.migration_id, clientOverride });
}

export async function verifyMigration({ sourcePath = env.sqlitePath, clientOverride = null } = {}) {
  const resolvedSource = path.resolve(sourcePath);
  const currentHash = computeFileHash(resolvedSource);

  const db = new Database(resolvedSource, { readonly: true });
  const rows = db.prepare("SELECT * FROM delivery_orders ORDER BY id").all();
  db.close();

  if (!clientOverride) {
    await runOrderMappingMigrations();
  }

  const runWithClient = clientOverride ? (fn) => fn(clientOverride) : withOrderMappingClient;
  let targetOrdersCount = 0;
  let targetShipmentsCount = 0;
  let latestJournal = null;
  let matchedOrders = 0;
  let missingOrders = 0;

  await runWithClient(async (client) => {
    const oRes = await client.query(`SELECT count(*) as cnt FROM "${env.orderMappingSchema}"."orders"`);
    const sRes = await client.query(`SELECT count(*) as cnt FROM "${env.orderMappingSchema}"."shipments"`);
    const jRes = await client.query(`SELECT * FROM "${env.orderMappingSchema}"."migration_journal" ORDER BY started_at DESC LIMIT 1`);
    targetOrdersCount = Number(oRes.rows[0]?.cnt || 0);
    targetShipmentsCount = Number(sRes.rows[0]?.cnt || 0);
    latestJournal = jRes.rows[0] || null;

    for (const row of rows) {
      if (!row.shopify_order_id) continue;
      const checkRes = await client.query(
        `SELECT id FROM "${env.orderMappingSchema}"."orders" WHERE shopify_order_id = $1`,
        [String(row.shopify_order_id).trim()],
      );
      if (checkRes.rows.length > 0) {
        matchedOrders += 1;
      } else {
        missingOrders += 1;
      }
    }
  });

  const valid = missingOrders === 0;

  return {
    valid,
    sourceHash: currentHash,
    sourceRows: rows.length,
    matchedOrders,
    missingOrders,
    targetOrdersCount,
    targetShipmentsCount,
    latestJournal,
  };
}

export async function rollbackMigration({ migrationId = null, confirm = false, clientOverride = null } = {}) {
  const hasConfirmFlag = confirm || process.argv.includes("--confirm") || process.argv.includes("--yes");
  const hasConfirmEnv = process.env.CONFIRM_MIGRATION === "true" || process.env.FORCE_MIGRATE === "true";

  if (!hasConfirmFlag && !hasConfirmEnv) {
    throw new Error("Migration rollback requires explicit confirmation (--confirm or CONFIRM_MIGRATION=true)");
  }

  if (!clientOverride) {
    await runOrderMappingMigrations();
  }

  const runWithClient = clientOverride ? (fn) => fn(clientOverride) : withOrderMappingClient;
  let mId = migrationId;
  if (!mId) {
    await runWithClient(async (client) => {
      const jRes = await client.query(
        `SELECT migration_id FROM "${env.orderMappingSchema}"."migration_journal" WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1`,
      );
      mId = jRes.rows[0]?.migration_id;
    });
  }

  if (!mId) {
    throw new Error("No completed migration found to rollback");
  }

  let deletedHistory = 0;
  let deletedShipments = 0;
  let deletedOrders = 0;

  await runWithClient(async (client) => {
    await client.query("BEGIN");

    const hRes = await client.query(
      `DELETE FROM "${env.orderMappingSchema}"."status_history" WHERE remarks LIKE $1 RETURNING id, order_id, shipment_id`,
      [`%${mId}%`],
    );
    deletedHistory = hRes.rows.length;

    const sRes = await client.query(
      `DELETE FROM "${env.orderMappingSchema}"."shipments" s
       WHERE NOT EXISTS (SELECT 1 FROM "${env.orderMappingSchema}"."status_history" sh WHERE sh.shipment_id = s.id)
       RETURNING id, order_id`,
    );
    deletedShipments = sRes.rows.length;

    const oRes = await client.query(
      `DELETE FROM "${env.orderMappingSchema}"."orders" o
       WHERE NOT EXISTS (SELECT 1 FROM "${env.orderMappingSchema}"."shipments" s WHERE s.order_id = o.id)
       RETURNING id`,
    );
    deletedOrders = oRes.rows.length;

    await client.query(
      `UPDATE "${env.orderMappingSchema}"."migration_journal" SET
         status = 'rolled_back',
         completed_at = NOW()
       WHERE migration_id = $1`,
      [mId],
    );

    await client.query("COMMIT");
  });

  return {
    migrationId: mId,
    status: "rolled_back",
    deletedHistory,
    deletedShipments,
    deletedOrders,
  };
}

export async function getMigrationStatus({ clientOverride = null } = {}) {
  if (!clientOverride) {
    await runOrderMappingMigrations();
  }

  const query = clientOverride
    ? clientOverride.query.bind(clientOverride)
    : orderMappingQuery;

  const jRes = await query(
    `SELECT * FROM "${env.orderMappingSchema}"."migration_journal" ORDER BY started_at DESC LIMIT 10`
  );

  return {
    journals: jRes.rows,
  };
}