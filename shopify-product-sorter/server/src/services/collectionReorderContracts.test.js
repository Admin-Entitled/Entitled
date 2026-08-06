import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import router from "../routes/api.js";
import {
  addActionLog,
  addNetworkLog,
  createRun,
  finishRun,
  getActiveRun,
  getRun,
  isRunActive,
  recoverStaleRuns,
} from "./sorterRuntimeService.js";

const setupTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
};

test("reorder-all-v2 active run locking returns 409 Conflict when a run is active", () => {
  recoverStaleRuns("reorder-all", 0);
  const activeRunBefore = getActiveRun("reorder-all");
  if (activeRunBefore && isRunActive(activeRunBefore)) {
    finishRun(activeRunBefore.id, { status: "failed", errorMessage: "Test setup cleanup" });
  }

  const run = createRun("reorder-all");
  assert.ok(run);
  assert.equal(run.status, "running");

  const currentActive = getActiveRun("reorder-all");
  assert.ok(currentActive);
  assert.equal(currentActive.id, run.id);
  assert.equal(isRunActive(currentActive), true);

  finishRun(run.id, { status: "completed" });
  const finishedRun = getRun(run.id);
  assert.equal(finishedRun.status, "completed");
  assert.equal(isRunActive(finishedRun), false);
  assert.equal(getActiveRun("reorder-all"), null);
});

test("legacy /collections/reorder-all returns 307 redirect to /api/collections/reorder-all-v2", async () => {
  const app = setupTestApp();
  const server = app.listen(0);
  const { port } = server.address();

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/collections/reorder-all`, {
      method: "POST",
      redirect: "manual",
    });

    assert.equal(res.status, 307, "Legacy reorder route must return 307 Temporary Redirect");
    assert.equal(
      res.headers.get("location"),
      "/api/collections/reorder-all-v2",
      "Redirect target must point to /api/collections/reorder-all-v2",
    );
  } finally {
    server.close();
  }
});

test("sorterRuntimeService action logs and network logs record run metrics and details", () => {
  const run = createRun("reorder-all");

  const actionLog = addActionLog({
    runId: run.id,
    actionType: "update_all_started",
    actionLabel: "Update All Collections started",
    status: "running",
  });
  assert.ok(actionLog.id);
  assert.equal(actionLog.runId, run.id);
  assert.equal(actionLog.actionType, "update_all_started");

  const networkLog = addNetworkLog({
    runId: run.id,
    collectionId: "gid://shopify/Collection/test-1",
    collectionTitle: "Test Collection",
    provider: "shopify",
    operationName: "FetchCollectionProducts",
    method: "POST",
    endpoint: "graphql",
    status: "success",
    durationMs: 45,
    metadata: { productsFetched: 12 },
  });

  assert.ok(networkLog.id);
  assert.equal(networkLog.runId, run.id);
  assert.equal(networkLog.operationName, "FetchCollectionProducts");
  assert.equal(networkLog.status, "success");

  finishRun(run.id, {
    status: "completed",
    totalCollections: 5,
    eligibleCollections: 3,
    succeeded: 2,
    unchanged: 1,
    movedProducts: 4,
  });

  const updatedRun = getRun(run.id);
  assert.equal(updatedRun.status, "completed");
  assert.equal(updatedRun.totalCollections, 5);
  assert.equal(updatedRun.eligibleCollections, 3);
  assert.equal(updatedRun.succeeded, 2);
  assert.equal(updatedRun.unchanged, 1);
  assert.equal(updatedRun.movedProducts, 4);
});

test("reorder-all-v2 summary envelope status transitions (completed, partial, failed)", () => {
  const computeRunStatus = (succeeded, failed, unchanged) => {
    return failed ? (succeeded || unchanged ? "partial" : "failed") : "completed";
  };

  assert.equal(computeRunStatus(3, 0, 1), "completed", "All succeeded or unchanged yields 'completed'");
  assert.equal(computeRunStatus(2, 1, 0), "partial", "Mixed success and failure yields 'partial'");
  assert.equal(computeRunStatus(0, 2, 0), "failed", "All failed yields 'failed'");

  const summary = {
    success: true,
    runId: "test-run-123",
    status: "running",
    totalCollections: 10,
    eligibleCollections: 8,
    succeeded: 6,
    failed: 2,
    skipped: 2,
    unchanged: 0,
    productsMoved: 15,
    results: [
      { collectionId: "c1", status: "completed", changed: 5 },
      { collectionId: "c2", status: "failed", errorMessage: "GraphQL Rate Limit" },
    ],
  };

  summary.status = computeRunStatus(summary.succeeded, summary.failed, summary.unchanged);
  summary.success = summary.failed === 0;

  assert.equal(summary.status, "partial");
  assert.equal(summary.success, false);
  assert.equal(summary.results.length, 2);
  assert.equal(summary.results[1].errorMessage, "GraphQL Rate Limit");
});
