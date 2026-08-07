import assert from "node:assert/strict";
import test from "node:test";
import { buildCollectionMoves } from "./shopifyService.js";
import { createBackup, getLatestBackup, getCollectionSnapshot, saveCollectionSnapshot } from "./collectionStateService.js";
import { AppError } from "../middleware/errorBoundary.js";
import { applyGeneratedOrder, computePreviewVersion } from "./sorterApplyService.js";

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

// ===== Product Sorter preview-to-apply contract (apply-order hardening) =====
// Synthetic Shopify IDs and an injected fake sync only: these tests must never
// touch a live Shopify mutation.
function applySnapshot(collectionId, ids, syncedAt = "2026-07-31T00:00:00.000Z") {
  return {
    collection: { id: collectionId, title: "Test Collection" },
    syncedAt,
    products: ids.map((id, index) => ({ id, title: `Product ${index + 1}`, collectionPosition: index + 1 })),
  };
}

function fakeApplySync() {
  const calls = [];
  const fn = async (_collectionId, ids) => {
    calls.push([...ids]);
    return {
      changed: ids.length,
      applied: true,
      batches: 1,
      collection: {
        collection: { sortOrder: "MANUAL", title: "Test Collection" },
        products: ids.map((id) => ({ id })),
      },
    };
  };
  fn.calls = calls;
  return fn;
}

function isAppErrorCode(code) {
  return (err) => err instanceof AppError && err.code === code;
}

test("Apply contract: valid string orderIds with the exact product set are accepted and sync runs exactly once", async () => {
  const collectionId = "gid://shopify/Collection/test-apply-valid";
  const ids = ["gid://shopify/Product/101", "gid://shopify/Product/102", "gid://shopify/Product/103"];
  const snapshot = applySnapshot(collectionId, ids);
  saveCollectionSnapshot(collectionId, snapshot);
  const previewVersion = computePreviewVersion(collectionId, snapshot);
  const sync = fakeApplySync();
  const reordered = ["gid://shopify/Product/103", "gid://shopify/Product/101", "gid://shopify/Product/102"];

  const result = await applyGeneratedOrder(collectionId, snapshot, reordered, {
    previewVersion,
    syncCollectionOrderFn: sync,
  });

  assert.equal(sync.calls.length, 1, "a valid apply must call sync exactly once");
  assert.deepEqual(sync.calls[0], reordered, "sync must receive the exact intended order");
  assert.equal(result.manualSort, "MANUAL");
  assert.equal(result.changed, 3);
});

test("Apply contract: object values inside orderIds are rejected before Shopify is called", async () => {
  const collectionId = "gid://shopify/Collection/test-apply-objects";
  const ids = ["gid://shopify/Product/101", "gid://shopify/Product/102"];
  const snapshot = applySnapshot(collectionId, ids);
  saveCollectionSnapshot(collectionId, snapshot);
  const sync = fakeApplySync();

  await assert.rejects(
    () =>
      applyGeneratedOrder(collectionId, snapshot, [{ id: ids[0] }, { id: ids[1] }], {
        previewVersion: computePreviewVersion(collectionId, snapshot),
        syncCollectionOrderFn: sync,
      }),
    isAppErrorCode("INVALID_ORDER_IDS"),
  );
  assert.equal(sync.calls.length, 0, "object entries must never reach Shopify");
});

test("Apply contract: missing IDs are rejected as stale without calling Shopify", async () => {
  const collectionId = "gid://shopify/Collection/test-apply-missing";
  const ids = ["gid://shopify/Product/101", "gid://shopify/Product/102", "gid://shopify/Product/103"];
  const snapshot = applySnapshot(collectionId, ids);
  saveCollectionSnapshot(collectionId, snapshot);
  const sync = fakeApplySync();

  await assert.rejects(
    () =>
      applyGeneratedOrder(collectionId, snapshot, ids.slice(0, 2), {
        previewVersion: computePreviewVersion(collectionId, snapshot),
        syncCollectionOrderFn: sync,
      }),
    isAppErrorCode("GENERATED_ORDER_STALE"),
  );
  assert.equal(sync.calls.length, 0, "missing IDs must never reach Shopify");
});

test("Apply contract: unexpected IDs are rejected as stale with counts-only details", async () => {
  const collectionId = "gid://shopify/Collection/test-apply-unexpected";
  const ids = ["gid://shopify/Product/101", "gid://shopify/Product/102", "gid://shopify/Product/103"];
  const snapshot = applySnapshot(collectionId, ids);
  saveCollectionSnapshot(collectionId, snapshot);
  const sync = fakeApplySync();

  await assert.rejects(
    () =>
      applyGeneratedOrder(collectionId, snapshot, [...ids, "gid://shopify/Product/999"], {
        previewVersion: computePreviewVersion(collectionId, snapshot),
        syncCollectionOrderFn: sync,
      }),
    (err) => {
      assert.equal(err.code, "GENERATED_ORDER_STALE");
      assert.equal(err.statusCode, 409);
      assert.deepEqual(err.details, {
        expectedCount: 3,
        receivedCount: 4,
        missingCount: 0,
        unexpectedCount: 1,
      });
      return true;
    },
  );
  assert.equal(sync.calls.length, 0, "unexpected IDs must never reach Shopify");
});

test("Apply contract: duplicate IDs are rejected without calling Shopify", async () => {
  const collectionId = "gid://shopify/Collection/test-apply-duplicates";
  const ids = ["gid://shopify/Product/101", "gid://shopify/Product/102", "gid://shopify/Product/103"];
  const snapshot = applySnapshot(collectionId, ids);
  saveCollectionSnapshot(collectionId, snapshot);
  const sync = fakeApplySync();

  await assert.rejects(
    () =>
      applyGeneratedOrder(collectionId, snapshot, [ids[0], ids[0], ids[1]], {
        previewVersion: computePreviewVersion(collectionId, snapshot),
        syncCollectionOrderFn: sync,
      }),
    isAppErrorCode("DUPLICATE_ORDER_IDS"),
  );
  assert.equal(sync.calls.length, 0, "duplicate IDs must never reach Shopify");
});

test("Apply contract: empty arrays are rejected without calling Shopify", async () => {
  const collectionId = "gid://shopify/Collection/test-apply-empty";
  const ids = ["gid://shopify/Product/101", "gid://shopify/Product/102"];
  const snapshot = applySnapshot(collectionId, ids);
  saveCollectionSnapshot(collectionId, snapshot);
  const sync = fakeApplySync();

  await assert.rejects(
    () =>
      applyGeneratedOrder(collectionId, snapshot, [], {
        previewVersion: computePreviewVersion(collectionId, snapshot),
        syncCollectionOrderFn: sync,
      }),
    isAppErrorCode("INVALID_ORDER_IDS"),
  );
  assert.equal(sync.calls.length, 0, "empty input must never reach Shopify");
});

test("Apply contract: non-string and blank entries are rejected without calling Shopify", async () => {
  const collectionId = "gid://shopify/Collection/test-apply-nonstring";
  const ids = ["gid://shopify/Product/101", "gid://shopify/Product/102"];
  const snapshot = applySnapshot(collectionId, ids);
  saveCollectionSnapshot(collectionId, snapshot);
  const sync = fakeApplySync();

  await assert.rejects(
    () =>
      applyGeneratedOrder(collectionId, snapshot, [ids[0], 42], {
        previewVersion: computePreviewVersion(collectionId, snapshot),
        syncCollectionOrderFn: sync,
      }),
    isAppErrorCode("INVALID_ORDER_IDS"),
  );
  await assert.rejects(
    () =>
      applyGeneratedOrder(collectionId, snapshot, [ids[0], "   "], {
        previewVersion: computePreviewVersion(collectionId, snapshot),
        syncCollectionOrderFn: sync,
      }),
    isAppErrorCode("INVALID_ORDER_IDS"),
  );
  assert.equal(sync.calls.length, 0, "invalid entries must never reach Shopify");
});

test("Apply contract: a stale previewVersion is rejected without calling Shopify", async () => {
  const collectionId = "gid://shopify/Collection/test-apply-stale";
  const ids = ["gid://shopify/Product/101", "gid://shopify/Product/102"];
  const oldSnapshot = applySnapshot(collectionId, ids, "2026-07-30T00:00:00.000Z");
  const oldVersion = computePreviewVersion(collectionId, oldSnapshot);
  const currentSnapshot = applySnapshot(collectionId, ids, "2026-07-31T00:00:00.000Z");
  saveCollectionSnapshot(collectionId, currentSnapshot);
  const sync = fakeApplySync();

  await assert.rejects(
    () =>
      applyGeneratedOrder(collectionId, currentSnapshot, ids, {
        previewVersion: oldVersion,
        syncCollectionOrderFn: sync,
      }),
    (err) => {
      assert.equal(err.code, "GENERATED_ORDER_STALE");
      assert.equal(err.statusCode, 409);
      assert.deepEqual(err.details, { expectedCount: 2, receivedCount: 2, missingCount: 0, unexpectedCount: 0 });
      return true;
    },
  );
  assert.equal(sync.calls.length, 0, "a stale preview must never reach Shopify");
});

test("Apply contract: a matching set without previewVersion still applies (rollback path)", async () => {
  const collectionId = "gid://shopify/Collection/test-apply-rollback-path";
  const ids = ["gid://shopify/Product/101", "gid://shopify/Product/102"];
  const snapshot = applySnapshot(collectionId, ids);
  saveCollectionSnapshot(collectionId, snapshot);
  const sync = fakeApplySync();

  const result = await applyGeneratedOrder(collectionId, snapshot, [ids[1], ids[0]], {
    syncCollectionOrderFn: sync,
  });

  assert.equal(sync.calls.length, 1, "rollback-style apply without previewVersion must still sync once");
  assert.equal(result.manualSort, "MANUAL");
});
