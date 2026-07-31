import { runOrderMappingMigrations } from "../services/orderMappingMigrations.js";
import { closeOrderMappingPool } from "../services/orderMappingDb.js";
import { migrateOrderMappingSqliteData } from "../services/orderMappingService.js";

const hasConfirmFlag = process.argv.includes("--confirm") || process.argv.includes("--yes");
const hasConfirmEnv = process.env.CONFIRM_MIGRATION === "true" || process.env.FORCE_MIGRATE === "true";

if (!hasConfirmFlag && !hasConfirmEnv) {
  console.error("Error: Migration commands require explicit operator intent.");
  console.error("Safety Class: DATA_MUTATION");
  console.error("To execute migrations, provide --confirm flag or set CONFIRM_MIGRATION=true.");
  console.error("Usage: npm run migrate:order-mapping-legacy --workspace server -- --confirm");
  process.exit(1);
}

await runOrderMappingMigrations();
console.log(JSON.stringify(await migrateOrderMappingSqliteData()));
await closeOrderMappingPool();
