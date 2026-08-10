import { Pool } from "pg";

import { env, resetEnvOverrides } from "../config/env.js";

export const DEFAULT_ORDER_MAPPING_SCHEMA = "order_mapping";
export const TEST_ORDER_MAPPING_SCHEMA_PREFIX = "order_mapping_test_";

function sanitizeSchemaSegment(value) {
  return String(value || "suite")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "suite";
}

function isSafeSchemaName(value) {
  return typeof value === "string"
    && value.startsWith(TEST_ORDER_MAPPING_SCHEMA_PREFIX)
    && /^[a-z0-9_]+$/.test(value);
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, "\"\"")}"`;
}

function createPool() {
  if (!env.databaseUrl) {
    throw new Error("Expenses test isolation requires DATABASE_URL");
  }
  return new Pool({
    connectionString: env.databaseUrl,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 15_000,
  });
}

export function configureIsolatedOrderMappingTestSchema(label) {
  process.env.NODE_ENV = "test";
  resetEnvOverrides();
  env.nodeEnv = "test";

  const existing = String(process.env.ORDER_MAPPING_SCHEMA || "").trim();
  const schema = existing || `${TEST_ORDER_MAPPING_SCHEMA_PREFIX}${sanitizeSchemaSegment(label)}_${process.pid}`;
  if (!isSafeSchemaName(schema)) {
    throw new Error(
      `Refusing to run Expenses DB fixtures outside an isolated test schema. Received ORDER_MAPPING_SCHEMA='${schema || "<empty>"}'.`,
    );
  }

  process.env.ORDER_MAPPING_SCHEMA = schema;
  env.orderMappingSchema = schema;
  return schema;
}

export function assertSafeExpensesTestTarget() {
  resetEnvOverrides();
  const nodeEnv = process.env.NODE_ENV || env.nodeEnv;
  const schema = String(process.env.ORDER_MAPPING_SCHEMA || env.orderMappingSchema || "").trim();
  if (nodeEnv !== "test") {
    throw new Error(`Refusing to run Expenses DB fixtures when NODE_ENV='${nodeEnv || "<empty>"}'.`);
  }
  if (!isSafeSchemaName(schema)) {
    throw new Error(
      `Refusing to run Expenses DB fixtures against non-test schema '${schema || "<empty>"}'. Expected prefix '${TEST_ORDER_MAPPING_SCHEMA_PREFIX}'.`,
    );
  }
  return schema;
}

export async function countRowsInSchemaTable(schema, table) {
  if (!/^[a-z0-9_]+$/i.test(schema) || !/^[a-z0-9_]+$/i.test(table)) {
    throw new Error("Invalid schema/table identifier");
  }
  const pool = createPool();
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2`,
      [schema, table],
    );
    if (!result.rows[0]?.count) {
      return 0;
    }
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`,
    );
    return countResult.rows[0]?.count || 0;
  } finally {
    await pool.end();
  }
}

export async function dropIsolatedOrderMappingSchema(schema = process.env.ORDER_MAPPING_SCHEMA || env.orderMappingSchema) {
  if (!isSafeSchemaName(schema)) {
    throw new Error(`Refusing to drop non-test schema '${schema || "<empty>"}'.`);
  }
  const pool = createPool();
  try {
    await pool.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
  } finally {
    await pool.end();
  }
}
