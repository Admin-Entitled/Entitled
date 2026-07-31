import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

console.log("=== Integrated Application Regression Gate ===");

// 1. Safety & Credential Check
process.env.NODE_ENV = "test";

const dbUrl = process.env.DATABASE_URL || "";
if (dbUrl.includes("production") && !process.env.ALLOW_PROD_TEST_RUN) {
  console.error("CRITICAL ERROR: Production DATABASE_URL detected during regression test gate execution.");
  console.error("Test execution aborted to prevent production data corruption.");
  process.exit(1);
}

console.log("✓ Environment safety check passed (NODE_ENV=test, production credentials safeguarded).");

// 2. Define Test Suites across all App & Route Families
const testSuites = [
  { name: "Sorter & Scoring Contracts", file: "server/src/services/sorter.test.js" },
  { name: "Collection Sync, Apply & Rollback", file: "server/src/services/collectionSyncApplyRollback.test.js" },
  { name: "Order Mapping Sync & Status Lifecycle", file: "server/src/services/orderMapping.test.js" },
  { name: "Order Mapping Client & UI Navigation", file: "client/src/api.test.js" },
  { name: "SKU Media Operations", file: "server/src/services/shopifyMediaService.test.js" },
  { name: "Sales Intelligence API Contracts", file: "server/src/services/actualSalesService.test.js" },
  { name: "Order Mapping Migration Integrity", file: "server/src/services/orderMappingMigrations.test.js" },
  { name: "Startup Commands & Operator Intent", file: "server/src/scripts/startupCommands.test.js" },
  { name: "Architecture Ledger Governance", file: "tests/architecture-ledger.test.js" },
];

const results = [];
let totalPassed = 0;
let totalFailed = 0;
const startTime = Date.now();

// 3. Execute Suites
for (const suite of testSuites) {
  const suiteStart = Date.now();
  try {
    console.log(`\nRunning [${suite.name}] (${suite.file})...`);
    execSync(`node --test ${suite.file}`, { stdio: "inherit" });
    const duration = Date.now() - suiteStart;
    results.push({ name: suite.name, file: suite.file, status: "PASSED", durationMs: duration });
    totalPassed++;
  } catch (err) {
    const duration = Date.now() - suiteStart;
    results.push({ name: suite.name, file: suite.file, status: "FAILED", durationMs: duration, error: err.message });
    totalFailed++;
  }
}

const totalDuration = Date.now() - startTime;

// 4. Generate Machine-Readable Report outside runtime data
const reportDir = path.resolve("test-results");
if (!fs.existsSync(reportDir)) {
  fs.mkdirSync(reportDir, { recursive: true });
}

const reportPath = path.join(reportDir, "regression-gate-report.json");
const reportData = {
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV,
  overallStatus: totalFailed === 0 ? "PASSED" : "FAILED",
  metrics: {
    totalSuites: testSuites.length,
    passedSuites: totalPassed,
    failedSuites: totalFailed,
    totalDurationMs: totalDuration,
  },
  suites: results,
};

fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), "utf8");

// 5. Output Summary
console.log("\n==============================================");
console.log("REGRESSION GATE EXECUTION SUMMARY");
console.log(`Overall Status:   ${reportData.overallStatus}`);
console.log(`Suites Passed:    ${totalPassed} / ${testSuites.length}`);
console.log(`Suites Failed:    ${totalFailed} / ${testSuites.length}`);
console.log(`Total Duration:   ${totalDuration}ms`);
console.log(`Machine Report:   ${reportPath}`);
console.log("==============================================");

if (totalFailed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
