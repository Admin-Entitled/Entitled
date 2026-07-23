import { runOrderMappingMigrations } from "../services/orderMappingMigrations.js";
import { closeOrderMappingPool } from "../services/orderMappingDb.js";
import { migrateOrderMappingSqliteData } from "../services/orderMappingService.js";

await runOrderMappingMigrations();
console.log(JSON.stringify(await migrateOrderMappingSqliteData()));
await closeOrderMappingPool();
