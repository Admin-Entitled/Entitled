import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getGitRoot() {
  try {
    const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
    return root;
  } catch (err) {
    return path.resolve(__dirname, "../../");
  }
}

const repoRoot = getGitRoot();
const appRoot = path.resolve(__dirname, "../");

// Strictly protected paths and patterns (NEVER delete)
const PROTECTED_PATTERNS = [
  "server/data/app.db",
  "server/data/backups",
  "order_mapping",
  "tokensave.db",
  ".tokensave",
  ".env",
  "customer",
  ".git"
];

// Target categories for safe cleanup preview/execution
const CLEANUP_TARGETS = [
  {
    name: "Graphify Caches & Artifacts",
    paths: [
      path.join(appRoot, "graphify-out/cache"),
      path.join(appRoot, "graphify-out/2026-07-31"),
    ]
  },
  {
    name: "Playwright Test Output",
    paths: [
      path.join(appRoot, "test-results/playwright"),
      path.join(appRoot, "playwright-report"),
      path.join(appRoot, "blob-report"),
      path.join(appRoot, ".tmp-playwright"),
    ]
  },
  {
    name: "Test Coverage & Results",
    paths: [
      path.join(appRoot, "test-results/coverage"),
      path.join(appRoot, "coverage"),
      path.join(appRoot, ".tmp"),
    ]
  }
];

function isProtectedPath(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return PROTECTED_PATTERNS.some(protectedPattern => normalized.includes(protectedPattern));
}

function isPathContained(targetPath) {
  const resolved = path.resolve(targetPath);
  return resolved.startsWith(repoRoot) || resolved.startsWith(appRoot);
}

export function generateHygieneReport() {
  const report = {
    repoRoot,
    appRoot,
    timestamp: new Date().toISOString(),
    protectedStores: [
      "server/data/app.db (Canonical SQLite Database)",
      "server/data/backups/ (Database Backups)",
      ".tokensave/ (TokenSave Index - External)",
      "order_mapping (PostgreSQL Schema)"
    ],
    categories: []
  };

  for (const category of CLEANUP_TARGETS) {
    const categoryInfo = {
      name: category.name,
      paths: []
    };

    for (const targetPath of category.paths) {
      const exists = fs.existsSync(targetPath);
      let sizeBytes = 0;
      let fileCount = 0;

      if (exists) {
        try {
          const stat = fs.statSync(targetPath);
          if (stat.isDirectory()) {
            const files = fs.readdirSync(targetPath, { recursive: true });
            fileCount = files.length;
          } else {
            fileCount = 1;
            sizeBytes = stat.size;
          }
        } catch (e) {
          // Path inaccessible
        }
      }

      categoryInfo.paths.push({
        path: path.relative(repoRoot, targetPath),
        exists,
        fileCount,
        isProtected: isProtectedPath(targetPath),
        isContained: isPathContained(targetPath)
      });
    }

    report.categories.push(categoryInfo);
  }

  return report;
}

export function executeCleanup(options = {}) {
  const confirm = options.confirm || false;
  const report = generateHygieneReport();
  const summary = {
    mode: confirm ? "EXECUTE" : "PREVIEW",
    removedPaths: [],
    skippedProtectedPaths: [],
    errors: []
  };

  console.log(`=== Repository Cleanliness (${summary.mode} Mode) ===`);
  console.log(`Repository Root: ${repoRoot}`);
  console.log(`Protected Stores: ${report.protectedStores.join(", ")}\n`);

  for (const category of report.categories) {
    console.log(`Category: ${category.name}`);
    for (const item of category.paths) {
      if (!item.exists) {
        console.log(`  [SKIP] ${item.path} (does not exist)`);
        continue;
      }

      if (item.isProtected) {
        console.log(`  [DENIED] ${item.path} (protected resource)`);
        summary.skippedProtectedPaths.push(item.path);
        continue;
      }

      if (!item.isContained) {
        console.log(`  [DENIED] ${item.path} (outside repository root boundary)`);
        summary.skippedProtectedPaths.push(item.path);
        continue;
      }

      if (!confirm) {
        console.log(`  [WOULD REMOVE] ${item.path} (${item.fileCount} items)`);
        summary.removedPaths.push(item.path);
      } else {
        try {
          const fullPath = path.resolve(repoRoot, item.path);
          fs.rmSync(fullPath, { recursive: true, force: true });
          console.log(`  [REMOVED] ${item.path}`);
          summary.removedPaths.push(item.path);
        } catch (err) {
          console.error(`  [ERROR] Failed to remove ${item.path}: ${err.message}`);
          summary.errors.push({ path: item.path, error: err.message });
        }
      }
    }
    console.log("");
  }

  if (!confirm) {
    console.log("Notice: Cleanliness executed in PREVIEW mode. Pass --confirm to execute actual deletion.");
  }

  return summary;
}

// CLI Execution Entry Point
if (process.argv[1] && process.argv[1].endsWith("clean.mjs")) {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm") || args.includes("--force");
  const result = executeCleanup({ confirm });
  if (result.errors.length > 0) {
    process.exit(1);
  }
}
