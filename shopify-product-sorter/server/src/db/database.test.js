import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import db, { getDb, closeDatabase, initDatabase } from "./database.js";
import { env, resetEnvOverrides } from "../config/env.js";

test("BE-010: Database module import performs lazy initialization without side effects on import", () => {
  const tmpDir = path.join(os.tmpdir(), `test-db-be010-${Date.now()}`);
  const tmpDbPath = path.join(tmpDir, "test.db");

  try {
    closeDatabase();
    resetEnvOverrides();
    env.sqlitePath = tmpDbPath;

    // Before accessing db, file must not exist
    assert.equal(fs.existsSync(tmpDbPath), false, "Database file should not exist prior to first query");

    // Invoking query triggers lazy initialization
    const result = db.prepare("SELECT 1 as val").get();
    assert.equal(result.val, 1);
    assert.equal(fs.existsSync(tmpDbPath), true, "Database file should exist after query");

    // Close
    closeDatabase();
  } finally {
    closeDatabase();
    resetEnvOverrides();
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
});
