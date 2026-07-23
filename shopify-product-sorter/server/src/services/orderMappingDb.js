import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";
import { env } from "../config/env.js";

let pool;

function createPool() {
  if (!env.databaseUrl) {
    throw new Error("Missing DATABASE_URL for Order Mapping");
  }

  return new Pool({
    connectionString: env.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
  });
}

export function getOrderMappingPool() {
  pool ||= createPool();
  return pool;
}

export async function closeOrderMappingPool() {
  if (!pool) {
    return;
  }
  const current = pool;
  pool = null;
  await current.end();
}

export async function withOrderMappingClient(work) {
  const client = await getOrderMappingPool().connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

export async function orderMappingQuery(text, values = [], client = null) {
  const runner = client || getOrderMappingPool();
  return runner.query(text, values);
}

export function orderMappingTable(name) {
  return `"${env.orderMappingSchema}"."${name}"`;
}

export function loadOrderMappingMigrationFiles() {
  const directory = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../migrations/order-mapping");
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      id: file,
      sql: fs.readFileSync(path.join(directory, file), "utf8"),
    }));
}
