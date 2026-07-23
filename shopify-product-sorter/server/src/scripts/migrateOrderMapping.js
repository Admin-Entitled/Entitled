import { runOrderMappingMigrations } from "../services/orderMappingMigrations.js";
import { closeOrderMappingPool } from "../services/orderMappingDb.js";

await runOrderMappingMigrations();
console.log("Order Mapping migrations applied");
await closeOrderMappingPool();
