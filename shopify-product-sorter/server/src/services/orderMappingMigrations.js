import { env } from "../config/env.js";
import { loadOrderMappingMigrationFiles, withOrderMappingClient } from "./orderMappingDb.js";
import { logInfo } from "../utils/logger.js";

function fillSchema(sql) {
  return sql.replaceAll("__SCHEMA__", `"${env.orderMappingSchema}"`);
}

export async function runOrderMappingMigrations() {
  if (!env.databaseUrl) {
    logInfo("Order Mapping disabled because DATABASE_URL is not configured.");
    return false;
  }

  await withOrderMappingClient(async (client) => {
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${env.orderMappingSchema}"`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${env.orderMappingSchema}"._migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const applied = new Set(
      (await client.query(`SELECT id FROM "${env.orderMappingSchema}"._migrations`)).rows.map((row) => row.id),
    );

    for (const migration of loadOrderMappingMigrationFiles()) {
      if (applied.has(migration.id)) {
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(fillSchema(migration.sql));
        await client.query(`INSERT INTO "${env.orderMappingSchema}"._migrations (id) VALUES ($1)`, [migration.id]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  });
}
