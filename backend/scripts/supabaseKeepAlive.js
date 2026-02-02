import dotenv from "dotenv";
import { supabase } from "../supabase.js";

dotenv.config();

const table = process.env.SUPABASE_KEEPALIVE_TABLE || "members";

async function runKeepAlive() {
  const startedAt = new Date().toISOString();

  const { count, error } = await supabase
    .from(table)
    .select("id", { head: true, count: "exact" })
    .limit(1);

  if (error) {
    console.error(`[${startedAt}] Supabase keepalive failed:`, error.message);
    process.exit(1);
  }

  console.log(`[${startedAt}] Supabase keepalive ok (table=${table}, count=${count ?? "n/a"})`);
}

runKeepAlive();
