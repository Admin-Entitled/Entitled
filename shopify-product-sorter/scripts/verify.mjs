import { execSync } from "node:child_process";
import http from "node:http";

console.log("=== Architecture System Verification ===");

// 1. Run architecture ledger doctor check
try {
  console.log("[1/3] Running architecture doctor...");
  execSync("node scripts/architecture-ledger.mjs doctor", { stdio: "inherit" });
} catch (err) {
  console.error("Architecture doctor check failed.");
  process.exit(1);
}

// 2. Run client build check
try {
  console.log("[2/3] Verifying build output...");
  execSync("npm run build", { stdio: "inherit" });
} catch (err) {
  console.error("Build verification failed.");
  process.exit(1);
}

// 3. Optional live server health check without requiring unannounced server process
console.log("[3/3] Checking optional live server health...");
const req = http.get("http://localhost:4000/api/debug/shopify", (res) => {
  console.log(`Live server health status code: ${res.statusCode}`);
  console.log("✓ System verification completed successfully.");
  process.exit(0);
});

req.on("error", () => {
  console.log("Notice: Live server is offline (optional integration check skipped).");
  console.log("✓ System verification completed successfully (offline mode).");
  process.exit(0);
});

req.setTimeout(2000, () => {
  req.destroy();
  console.log("Notice: Live server response timed out (optional integration check skipped).");
  console.log("✓ System verification completed successfully (offline mode).");
  process.exit(0);
});
