import assert from "node:assert/strict";
import test from "node:test";
import { execSync } from "node:child_process";

test("npm run verify runs offline without unannounced live server error", () => {
  const output = execSync("npm run verify", { encoding: "utf8" });
  assert.ok(output.includes("Architecture System Verification"));
  assert.ok(output.includes("System verification completed successfully"));
});

test("migrateOrderMapping script requires explicit operator intent flag or env", () => {
  assert.throws(
    () => {
      execSync("node server/src/scripts/migrateOrderMapping.js", {
        encoding: "utf8",
        stdio: "pipe",
      });
    },
    (err) => {
      assert.equal(err.status, 1);
      assert.ok(err.stderr.includes("Migration commands require explicit operator intent"));
      assert.ok(err.stderr.includes("Safety Class: DATA_MUTATION"));
      return true;
    },
  );
});

test("migrateOrderMappingLegacy script requires explicit operator intent flag or env", () => {
  assert.throws(
    () => {
      execSync("node server/src/scripts/migrateOrderMappingLegacy.js", {
        encoding: "utf8",
        stdio: "pipe",
      });
    },
    (err) => {
      assert.equal(err.status, 1);
      assert.ok(err.stderr.includes("Migration commands require explicit operator intent"));
      assert.ok(err.stderr.includes("Safety Class: DATA_MUTATION"));
      return true;
    },
  );
});
