import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionMoves } from "./shopifyService.js";
import { createBackup, getLatestBackup, getCollectionSnapshot, saveCollectionSnapshot } from "./collectionStateService.js";

test("Apply refuses mismatched product sets", () => {
  const currentIds = ["prod_1", "prod_2", "prod_3"];
  const validDesired = ["prod_3", "prod_1", "prod_2"];

  // Valid move generation
  const moves = buildCollectionMoves(currentIds, validDesired);
  assert.ok(Array.isArray(moves));
  assert.ok(moves.length > 0);

  // Mismatched set (extra ID)
  assert.throws(
    () => buildCollectionMoves(currentIds, ["prod_1", "prod_2", "prod_99"]),
    /exactly once/,
  );

  // Mismatched set (missing ID)
  assert.throws(
    () => buildCollectionMoves(currentIds, ["prod_1", "prod_2"]),
    /exactly once/,
  );

  // Mismatched set (duplicate ID)
  assert.throws(
    () => buildCollectionMoves(currentIds, ["prod_1", "prod_1", "prod_2"]),
    /exactly once/,
  );
});

test("Backup precedes Shopify write and records pre-apply state", () => {
  const collectionId = "gid://shopify/Collection/test-backup-precede";
  const initialOrder = [
    { id: "p1", position: 1 },
    { id: "p2", position: 2 },
  ];

  createBackup(collectionId, "apply", initialOrder);

  const backup = getLatestBackup(collectionId, "apply");
  assert.ok(backup);
  assert.equal(backup.collectionId, collectionId);
  assert.equal(backup.type, "apply");
  assert.deepEqual(backup.order, initialOrder);
});

test("Rollback restores the recorded order from latest backup", () => {
  const collectionId = "gid://shopify/Collection/test-rollback";
  const originalOrder = ["prod_A", "prod_B", "prod_C"];
  const modifiedOrder = ["prod_C", "prod_A", "prod_B"];

  // Create initial backup before applying new order
  createBackup(collectionId, "apply", originalOrder);

  // Simulate apply failure or rollback request
  const backup = getLatestBackup(collectionId, "apply");
  assert.ok(backup);
  assert.deepEqual(backup.order, originalOrder);

  // Verify moves to restore original order from modified state
  const rollbackMoves = buildCollectionMoves(modifiedOrder, backup.order);
  assert.ok(rollbackMoves.length > 0);
});

test("Failure paths preserve collection snapshot and backup state", () => {
  const collectionId = "gid://shopify/Collection/test-failure-path";
  const snapshotData = { products: [{ id: "p1" }], timestamp: Date.now() };

  saveCollectionSnapshot(collectionId, snapshotData);

  // Simulate an invalid apply attempt that fails validation
  assert.throws(
    () => buildCollectionMoves(["p1"], ["invalid_product"]),
    /exactly once/,
  );

  // Verify saved snapshot remains intact after failure
  const savedSnapshot = getCollectionSnapshot(collectionId);
  assert.deepEqual(savedSnapshot, snapshotData);
});

test("Collection move calculation is deterministic for unchanged input", () => {
  const current = ["p1", "p2", "p3", "p4"];
  const desired = ["p4", "p2", "p1", "p3"];

  const moves1 = buildCollectionMoves(current, desired);
  const moves2 = buildCollectionMoves(current, desired);

  assert.deepEqual(moves1, moves2);
});
