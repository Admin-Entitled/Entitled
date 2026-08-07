import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { generateHygieneReport, executeCleanup } from "../scripts/clean.mjs";

test("Hygiene & Cleanliness Script: PREVIEW mode by default", () => {
  const result = executeCleanup({ confirm: false });
  assert.equal(result.mode, "PREVIEW");
  assert.ok(Array.isArray(result.removedPaths));
  assert.ok(Array.isArray(result.skippedProtectedPaths));
});

test("Hygiene & Cleanliness Script: Protects database, backup, and token paths", () => {
  const report = generateHygieneReport();
  assert.ok(report.protectedStores.some(s => s.includes("app.db")));
  assert.ok(report.protectedStores.some(s => s.includes("backups")));
  assert.ok(report.protectedStores.some(s => s.includes("TokenSave")));
});

test("Retention Policy Spec: Verify retention documentation exists and covers all 25 classes", () => {
  const docPath = path.resolve("docs/architecture/DATA_RETENTION_AND_DISPOSAL_POLICY.md");
  assert.ok(fs.existsSync(docPath), "Retention policy spec must exist");

  const content = fs.readFileSync(docPath, "utf8");
  const requiredTerms = [
    "Runtime Databases (SQLite)",
    "Runtime Databases (PostgreSQL)",
    "Database Backups",
    "Migration Journals",
    "Application Audit Records",
    "Security Logs",
    "General Application Logs",
    "Diagnostics & Dumps",
    "Product Sorter Snapshots",
    "Order Backups",
    "SKU Audit Records",
    "SKU Upload Staging",
    "Sales Intelligence Caches",
    "Sales Intelligence Exports",
    "CSV Imports",
    "Generated Reports",
    "Graphify Output",
    "Playwright Artifacts",
    "Test Results",
    "Coverage Reports",
    "Temporary Fixtures",
    "TokenSave State",
    "Customer Exports",
    "Failed-Import Quarantine",
    "Reconciliation Exceptions"
  ];

  for (const term of requiredTerms) {
    assert.ok(content.includes(term), `Retention policy must cover: ${term}`);
  }
});

test("Tool & Artifact Isolation Spec: Covers Graphify, TokenSave, Playwright, and Test Outputs", () => {
  const specPath = path.resolve("docs/architecture/TOOL_ISOLATION_AND_TOKENSAVE_SPECIFICATION.md");
  assert.ok(fs.existsSync(specPath), "Tool isolation spec must exist");

  const content = fs.readFileSync(specPath, "utf8");
  assert.ok(content.includes("TokenSave"), "Spec must cover TokenSave (OPS-006)");
  assert.ok(content.includes("Graphify"), "Spec must cover Graphify (OPS-005)");
  assert.ok(content.includes("Playwright"), "Spec must cover Playwright (OPS-007)");
  assert.ok(content.includes("Test Outputs"), "Spec must cover Test Outputs (OPS-008)");
});
