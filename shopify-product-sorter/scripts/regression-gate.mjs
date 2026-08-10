import { execSync } from "node:child_process";
function safeExecSync(cmd, opts = {}) {
  try {
    return execSync(cmd, opts);
  } catch (err) {
    if (err.status === 0) {
      return err.stdout || "";
    }
    throw err;
  }
}
import fs from "node:fs";
import path from "node:path";

console.log("=== Integrated Application Regression Gate ===");

// 1. Safety & Credential Check
process.env.NODE_ENV = "test";
const regressionSchemaPrefix = "order_mapping_test_gate_";
const configuredRegressionSchema = process.env.ORDER_MAPPING_SCHEMA || `${regressionSchemaPrefix}${process.pid}`;
if (!configuredRegressionSchema.startsWith(regressionSchemaPrefix)) {
  console.error(`CRITICAL ERROR: Unsafe ORDER_MAPPING_SCHEMA for regression gate: ${configuredRegressionSchema}`);
  process.exit(1);
}
process.env.ORDER_MAPPING_SCHEMA = configuredRegressionSchema;

const dbUrl = process.env.DATABASE_URL || "";
if (dbUrl.includes("production") && !process.env.ALLOW_PROD_TEST_RUN) {
  console.error("CRITICAL ERROR: Production DATABASE_URL detected during regression test gate execution.");
  console.error("Test execution aborted to prevent production data corruption.");
  process.exit(1);
}

console.log("✓ Environment safety check passed (NODE_ENV=test, isolated ORDER_MAPPING_SCHEMA enforced, production credentials safeguarded).");

// 2. Define Test Suites across all App & Route Families
export const testSuites = [
  { name: "Sorter & Scoring Contracts", file: "server/src/services/sorter.test.js" },
  { name: "Collection Sync, Apply & Rollback", file: "server/src/services/collectionSyncApplyRollback.test.js" },
  { name: "Order Mapping Sync & Status Lifecycle", file: "server/src/services/orderMapping.test.js" },
  { name: "Order Mapping Client & UI Navigation", file: "client/src/api.test.js" },
  { name: "Frontend Style Isolation", file: "client/src/styles.test.js" },
  { name: "Frontend Component & Module Regression", file: "client/src/frontendRegression.test.js" },
  { name: "SKU Media Operations", file: "server/src/services/shopifyMediaService.test.js" },
  { name: "Sales Intelligence API Contracts", file: "server/src/services/actualSalesService.test.js" },
  { name: "Order Mapping Migration Integrity", file: "server/src/services/orderMappingMigrations.test.js" },
  { name: "Startup Commands & Operator Intent", file: "server/src/scripts/startupCommands.test.js" },
  { name: "Deterministic Integration Mocks", file: "server/src/services/providerIntegration.test.js" },
  { name: "Meta Ads Read-Only Dashboard", file: "server/src/routes/metaAds.test.js" },
  { name: "Expenses Backend & Import Flow", file: "server/src/routes/expenses.test.js" },
  { name: "Expenses Provider & Parser Semantics", file: "server/src/services/expenseService.test.js" },
  { name: "Health Checks & Diagnostics", file: "server/src/routes/health.test.js" },
  { name: "Frontend Static Fallback & Route Boundary", file: "server/src/routes/staticFallback.test.js" },
  { name: "Architecture Ledger Governance", file: "tests/architecture-ledger.test.js" },
];

export function preflightSuite(suite, rootDir = process.cwd()) {
  const relPath = suite.file;
  const absPath = path.resolve(rootDir, relPath);

  if (!fs.existsSync(absPath)) {
    return {
      valid: false,
      category: "MISSING_TEST_FILE",
      reason: `MISSING_TEST_FILE: Suite file does not exist on disk: ${relPath}`,
    };
  }

  const stat = fs.statSync(absPath);
  if (!stat.isFile()) {
    return {
      valid: false,
      category: "MISSING_TEST_FILE",
      reason: `MISSING_TEST_FILE: Suite path is not a regular file: ${relPath}`,
    };
  }

  try {
    safeExecSync(`git ls-files --error-unmatch "${relPath}"`, { cwd: rootDir, stdio: "pipe" });
  } catch (err) {
    return {
      valid: false,
      category: "UNTRACKED_TEST_FILE",
      reason: `UNTRACKED_TEST_FILE: Suite file is untracked by Git: ${relPath}`,
    };
  }

  let prefix = "";
  try {
    prefix = safeExecSync("git rev-parse --show-prefix", { cwd: rootDir, encoding: "utf8" }).trim();
  } catch (e) {}
  const gitPath = prefix + relPath;
  try {
    safeExecSync(`git cat-file -e "HEAD:${gitPath}"`, { cwd: rootDir, stdio: "pipe" });
  } catch (err) {
    return {
      valid: false,
      category: "NOT_PRESENT_IN_HEAD",
      reason: `NOT_PRESENT_IN_HEAD: Suite file is absent from HEAD commit: ${relPath}`,
    };
  }

  const fileContent = fs.readFileSync(absPath, "utf8");
  if (
    fileContent.includes("ALLOW_PROD_TEST_RUN=true") ||
    fileContent.includes("process.env.ALLOW_PROD_TEST_RUN = \"true\"") ||
    fileContent.includes("process.env.ALLOW_PROD_TEST_RUN = 'true'")
  ) {
    return {
      valid: false,
      category: "ENVIRONMENT_SAFETY_FAILURE",
      reason: `ENVIRONMENT_SAFETY_FAILURE: Suite file contains obvious live-production opt-in: ${relPath}`,
    };
  }

  return { valid: true };
}

export function runPreflight(suites = testSuites, rootDir = process.cwd()) {
  const preflightErrors = [];
  for (const suite of suites) {
    const res = preflightSuite(suite, rootDir);
    if (!res.valid) {
      preflightErrors.push({
        suite: suite.name,
        file: suite.file,
        category: res.category,
        reason: res.reason,
      });
    }
  }
  return preflightErrors;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const startTime = Date.now();
  const preflightErrors = runPreflight(testSuites);

  const results = [];
  let totalPassed = 0;
  let totalFailed = 0;

  if (preflightErrors.length > 0) {
    console.error("\nREGRESSION_GATE_CONFIGURATION_ERROR");
    console.error(`Preflight check failed with ${preflightErrors.length} configuration error(s):`);
    for (const err of preflightErrors) {
      console.error(`  - [${err.category}] ${err.suite} (${err.file}): ${err.reason}`);
      results.push({
        name: err.suite,
        file: err.file,
        status: "FAILED",
        category: err.category,
        error: err.reason,
        durationMs: 0,
      });
      totalFailed++;
    }

    for (const suite of testSuites) {
      if (!preflightErrors.some((e) => e.file === suite.file)) {
        results.push({
          name: suite.name,
          file: suite.file,
          status: "SKIPPED",
          category: "PREFLIGHT_ABORTED",
          error: "Suite execution aborted due to preflight configuration failure",
          durationMs: 0,
        });
      }
    }
  } else {
    // 3. Execute Suites
    for (const suite of testSuites) {
      const suiteStart = Date.now();
      try {
        console.log(`\nRunning [${suite.name}] (${suite.file})...`);
        safeExecSync(`node --test "${suite.file}"`, {
          stdio: "inherit",
          env: {
            ...process.env,
            NODE_ENV: "test",
            ORDER_MAPPING_SCHEMA: `${regressionSchemaPrefix}${suite.file.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase()}_${process.pid}`,
          },
        });
        const duration = Date.now() - suiteStart;
        results.push({
          name: suite.name,
          file: suite.file,
          status: "PASSED",
          category: "SUCCESS",
          durationMs: duration,
        });
        totalPassed++;
      } catch (err) {
        const duration = Date.now() - suiteStart;
        results.push({
          name: suite.name,
          file: suite.file,
          status: "FAILED",
          category: "TEST_EXECUTION_FAILURE",
          durationMs: duration,
          error: err.message,
        });
        totalFailed++;
      }
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
    preflightStatus: preflightErrors.length === 0 ? "PASSED" : "FAILED",
    metrics: {
      totalSuites: testSuites.length,
      passedSuites: totalPassed,
      failedSuites: totalFailed,
      preflightFailures: preflightErrors.length,
      totalDurationMs: totalDuration,
    },
    preflightErrors,
    suites: results,
  };

  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2), "utf8");

  // 5. Output Summary
  console.log("\n==============================================");
  console.log("REGRESSION GATE EXECUTION SUMMARY");
  console.log(`Overall Status:   ${reportData.overallStatus}`);
  console.log(`Preflight Status: ${reportData.preflightStatus}`);
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
}
