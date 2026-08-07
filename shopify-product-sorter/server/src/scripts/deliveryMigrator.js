import {
  createSourceBackup,
  testSourceRestore,
  planMigration,
  dryRunMigration,
  executeMigration,
  resumeMigration,
  verifyMigration,
  rollbackMigration,
  getMigrationStatus,
} from "../services/deliveryMigratorService.js";
import { closeOrderMappingPool } from "../services/orderMappingDb.js";

const args = process.argv.slice(2);
const getArg = (flag) => {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
};

const hasFlag = (flag) => args.includes(flag);
const sourcePath = getArg("--source") || process.env.SQLITE_PATH;
const migrationId = getArg("--migration-id");
const confirm = hasFlag("--confirm") || hasFlag("--yes") || process.env.CONFIRM_MIGRATION === "true";

async function main() {
  try {
    if (hasFlag("--backup")) {
      const res = await createSourceBackup(sourcePath);
      console.log(JSON.stringify({ mode: "backup", result: res }, null, 2));
    } else if (hasFlag("--restore-test")) {
      const backupPath = getArg("--backup-path") || sourcePath;
      const res = await testSourceRestore(backupPath);
      console.log(JSON.stringify({ mode: "restore-test", result: res }, null, 2));
    } else if (hasFlag("--plan")) {
      const res = await planMigration({ sourcePath });
      console.log(JSON.stringify({ mode: "plan", result: res }, null, 2));
    } else if (hasFlag("--dry-run")) {
      const res = await dryRunMigration({ sourcePath });
      console.log(JSON.stringify({ mode: "dry-run", result: res }, null, 2));
    } else if (hasFlag("--execute")) {
      const res = await executeMigration({ sourcePath, confirm, migrationId });
      console.log(JSON.stringify({ mode: "execute", result: res }, null, 2));
    } else if (hasFlag("--resume")) {
      const res = await resumeMigration({ sourcePath, confirm, migrationId });
      console.log(JSON.stringify({ mode: "resume", result: res }, null, 2));
    } else if (hasFlag("--verify")) {
      const res = await verifyMigration({ sourcePath });
      console.log(JSON.stringify({ mode: "verify", result: res }, null, 2));
    } else if (hasFlag("--rollback")) {
      const res = await rollbackMigration({ migrationId, confirm });
      console.log(JSON.stringify({ mode: "rollback", result: res }, null, 2));
    } else if (hasFlag("--status")) {
      const res = await getMigrationStatus();
      console.log(JSON.stringify({ mode: "status", result: res }, null, 2));
    } else {
      console.log("Usage: node deliveryMigrator.js [--backup|--restore-test|--plan|--dry-run|--execute|--resume|--verify|--rollback|--status] [--source <path>] [--confirm]");
    }
  } catch (error) {
    console.error(JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
    process.exitCode = 1;
  } finally {
    await closeOrderMappingPool();
  }
}

await main();
