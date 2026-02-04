import dotenv from "dotenv";
import { supabase } from "../supabase.js";
import { pathToFileURL } from "url";

dotenv.config();

const table = process.env.SUPABASE_KEEPALIVE_TABLE || "members";
const renderHealthUrl = process.env.RENDER_HEALTHCHECK_URL;

async function pingSupabase(startedAt) {
  const { error } = await supabase
    .from(table)
    .select("id", { head: true })
    .limit(1);

  if (error) {
    throw new Error(`Supabase keepalive failed: ${error.message}`);
  }

  console.log(`[${startedAt}] Supabase keepalive ok (table=${table})`);
}

async function pingRender(startedAt) {
  if (!renderHealthUrl) {
    console.warn(
      `[${startedAt}] RENDER_HEALTHCHECK_URL is not set; skipping Render keepalive`
    );
    return;
  }

  const response = await fetch(renderHealthUrl, {
    method: "GET",
    signal: AbortSignal.timeout(7000),
  });

  if (!response.ok) {
    throw new Error(
      `Render keepalive failed: ${response.status} ${response.statusText}`
    );
  }

  console.log(`[${startedAt}] Render keepalive ok (${renderHealthUrl})`);
}

export async function runKeepAlive() {
  const startedAt = new Date().toISOString();
  await Promise.all([pingSupabase(startedAt), pingRender(startedAt)]);
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  runKeepAlive().catch((error) => {
    console.error(`[${new Date().toISOString()}] ${error.message}`);
    process.exit(1);
  });
}
