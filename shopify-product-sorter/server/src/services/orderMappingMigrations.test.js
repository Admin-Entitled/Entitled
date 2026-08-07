import assert from "node:assert/strict";
import test from "node:test";
import { loadOrderMappingMigrationFiles, orderMappingTable } from "./orderMappingDb.js";
import { env } from "../config/env.js";

test("loadOrderMappingMigrationFiles returns sorted non-empty migration objects", () => {
  const migrations = loadOrderMappingMigrationFiles();
  assert.ok(Array.isArray(migrations));
  assert.ok(migrations.length > 0);

  for (const m of migrations) {
    assert.ok(typeof m.id === "string" && m.id.endsWith(".sql"));
    assert.ok(typeof m.sql === "string" && m.sql.trim().length > 0);
  }

  const ids = migrations.map((m) => m.id);
  const sorted = [...ids].sort();
  assert.deepEqual(ids, sorted);
});

test("orderMappingTable produces schema-qualified table name", () => {
  const tableName = orderMappingTable("order_mapping");
  assert.equal(tableName, `"${env.orderMappingSchema}"."order_mapping"`);
});

test("migration files contain schema placeholders or valid DDL", () => {
  const migrations = loadOrderMappingMigrationFiles();
  for (const m of migrations) {
    assert.ok(
      m.sql.includes("__SCHEMA__") ||
      m.sql.toUpperCase().includes("CREATE TABLE") ||
      m.sql.toUpperCase().includes("ALTER TABLE") ||
      m.sql.toUpperCase().includes("CREATE INDEX"),
    );
  }
});
