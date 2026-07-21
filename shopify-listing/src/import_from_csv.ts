import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { request } from "undici";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { parseCsvFile } from "./csv_parser";
import { CsvReporter, createRunId, type SkuLogEntry } from "./report";
import { ShopifyClient } from "./shopify";
import { asyncPool, nowIso } from "./utils";

const EMBEDDED_SHOPIFY_OAUTH = {
  tokenUrl: "https://entitled-club-2.myshopify.com/admin/oauth/access_token",
  clientId: "9310a7177cf9bd2529922b872e85bc01",
  clientSecret: "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",
  code: "9380",
} as const;

async function fetchTokenFromEmbeddedOauth(): Promise<string> {
  const { tokenUrl, clientId, clientSecret, code } = EMBEDDED_SHOPIFY_OAUTH;
  if (
    !clientId ||
    !clientSecret ||
    !code ||
    clientId.startsWith("REPLACE_") ||
    clientSecret.startsWith("REPLACE_") ||
    code.startsWith("REPLACE_")
  ) {
    throw new Error("Embedded Shopify OAuth values are not configured in src/import_from_csv.ts");
  }

  const res = await request(tokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
    }),
  });

  const body = await res.body.text();
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Shopify token exchange failed (${res.statusCode}): ${body}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`Shopify token exchange returned non-JSON response: ${body}`);
  }

  const token =
    typeof parsed === "object" && parsed !== null && "access_token" in parsed
      ? String((parsed as { access_token?: unknown }).access_token ?? "").trim()
      : "";

  if (!token) {
    throw new Error(`Shopify token exchange response missing access_token: ${body}`);
  }

  return token;
}

function renderProgress(done: number, total: number): string {
  const safeTotal = Math.max(1, total);
  const percent = Math.min(100, Math.round((done / safeTotal) * 100));
  const width = 30;
  const filled = Math.round((percent / 100) * width);
  const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
  return `Progress [${bar}] ${percent}% (${done}/${total})`;
}

async function main(): Promise<void> {
  const argv = await yargs(hideBin(process.argv))
    .scriptName("import_from_csv")
    .option("csv", { type: "string", demandOption: true, description: "Path to source CSV file" })
    .option("store", { type: "string", description: "Shopify store domain, ex: yourstore.myshopify.com" })
    .option("token", { type: "string", description: "Shopify Admin API access token" })
    .option("locationName", { type: "string", description: "Shopify location name" })
    .option("locationId", { type: "string", description: "Shopify location GID" })
    .option("dryRun", { type: "boolean", default: false })
    .option("concurrency", { type: "number", default: 1 })
    .option("logPrefix", { type: "string" })
    .strict()
    .parse();

  const store = (argv.store ?? process.env.SHOPIFY_STORE ?? "").trim();
  const locationId = (argv.locationId ?? process.env.SHOPIFY_LOCATION_ID ?? "").trim();
  const locationName = (argv.locationName ?? process.env.SHOPIFY_LOCATION_NAME ?? "").trim();
  const token = argv.dryRun ? "" : (argv.token ?? (await fetchTokenFromEmbeddedOauth()) ?? "").trim();

  if (!argv.dryRun) {
    if (!store) throw new Error("--store is required unless --dryRun is enabled (or set SHOPIFY_STORE in .env)");
    if (!token) {
      throw new Error("--token is required unless --dryRun is enabled");
    }
    if (!locationName && !locationId) {
      throw new Error(
        "Provide either --locationName or --locationId unless --dryRun is enabled (or set SHOPIFY_LOCATION_NAME/SHOPIFY_LOCATION_ID in .env)"
      );
    }
  }

  const csvPath = resolve(process.cwd(), argv.csv);
  if (!existsSync(csvPath)) {
    throw new Error(`CSV file not found at: ${csvPath}`);
  }
  const runId = createRunId();
  const startedAt = nowIso();

  const reporter = new CsvReporter(resolve(process.cwd(), "logs"), runId, argv.logPrefix);
  const parsed = parseCsvFile(csvPath);
  const concurrency = Math.max(1, Math.min(4, Math.trunc(argv.concurrency)));
  if (concurrency !== argv.concurrency) {
    console.log(`Adjusted concurrency to ${concurrency} (allowed range: 1-4).`);
  }

  console.log(
    `Starting import run=${runId} dryRun=${argv.dryRun} input=${csvPath}${parsed.sourceSheet ? ` sheet=${parsed.sourceSheet}` : ""}`
  );
  console.log(`Rows parsed=${parsed.totalRows} groups=${parsed.groups.length} concurrency=${concurrency}`);
  console.log(renderProgress(0, parsed.groups.length));
  const invalidTypeGroups = parsed.groups.filter((group) =>
    group.validationErrors.some((err) => err.startsWith("invalid product type"))
  );
  if (invalidTypeGroups.length > 0) {
    console.error(
      `Invalid product type detected for ${invalidTypeGroups.length} SKU group(s). Allowed values: RN, Polo, Shirt, Denim Shirt, Linen Shirt.`
    );
    for (const group of invalidTypeGroups) {
      console.error(`Fix type in item_variant_master: sku=${group.sku || "<missing>"} type='${group.productType}'`);
    }
  }

  const shopify = argv.dryRun
    ? null
    : new ShopifyClient({
        store,
        adminToken: token,
        apiVersion: "2025-01",
        locationId: locationId || undefined,
        locationName: locationName || undefined,
      });

  const entries: SkuLogEntry[] = [];
  let processed = 0;

  await asyncPool(concurrency, parsed.groups, async (group, index) => {
    const started = Date.now();
    let entry: SkuLogEntry;
    console.log(
      `[${index + 1}/${parsed.groups.length}] Start sku=${group.sku || "<missing>"} variants=${group.variants.length}`
    );

    if (group.validationErrors.length > 0) {
      entry = {
        runId,
        sku: group.sku,
        source: { type: "csv", path: csvPath },
        rowIndexes: group.rowIndexes,
        created: false,
        productGid: null,
        title: group.title,
        vendor: group.vendor,
        productType: group.productType,
        color: group.color,
        status: group.status,
        optionsCreated: ["Size"],
        propertiesAdded: {
          tagsAdded: group.tags,
          variantsCreated: [],
          inventoryActions: [],
          derivedFieldsUsed: group.derivedFieldsUsed,
        },
        warnings: group.warnings,
        errors: group.validationErrors,
        metrics: {
          variantsPlanned: group.variants.length,
          variantsCreated: 0,
          inventorySetCount: 0,
          throttleRetries: 0,
          shopifyCalls: 0,
          executionTimeMs: Date.now() - started,
        },
        summary: {
          status: "SKIPPED",
          reason: "validation failed",
        },
      };
    } else if (argv.dryRun) {
      entry = {
        runId,
        sku: group.sku,
        source: { type: "csv", path: csvPath },
        rowIndexes: group.rowIndexes,
        created: false,
        productGid: null,
        title: group.title,
        vendor: group.vendor,
        productType: group.productType,
        color: group.color,
        status: group.status,
        optionsCreated: ["Size"],
        propertiesAdded: {
          tagsAdded: group.tags,
          variantsCreated: group.variants.map((v) => ({
            size: v.size,
            variantSku: `${group.sku}-${v.size}`,
            variantGid: "",
            price: group.sellingPrice,
            qtySet: v.qty,
          })),
          inventoryActions: [],
          derivedFieldsUsed: group.derivedFieldsUsed,
        },
        warnings: group.warnings,
        errors: [],
        metrics: {
          variantsPlanned: group.variants.length,
          variantsCreated: 0,
          inventorySetCount: 0,
          throttleRetries: 0,
          shopifyCalls: 0,
          executionTimeMs: Date.now() - started,
        },
        summary: {
          status: "DRY_RUN",
          reason: "dryRun",
        },
      };
    } else {
      const result = await shopify!.importSkuGroup(group);
      entry = {
        runId,
        sku: group.sku,
        source: { type: "csv", path: csvPath },
        rowIndexes: group.rowIndexes,
        created: result.created,
        productGid: result.productGid ?? null,
        title: group.title,
        vendor: group.vendor,
        productType: group.productType,
        color: group.color,
        status: group.status,
        optionsCreated: ["Size"],
        propertiesAdded: {
          tagsAdded: group.tags,
          variantsCreated: result.variantsCreated,
          inventoryActions: result.inventoryActions,
          derivedFieldsUsed: group.derivedFieldsUsed,
        },
        warnings: [...group.warnings, ...result.warnings],
        errors: result.errors,
        metrics: result.metrics,
        summary: result.created
          ? { status: "SUCCESS" }
          : {
              status: "FAILED",
              reason: result.errors[0] ?? "unknown",
            },
      };
    }

    reporter.writeEntry(entry);
    entries.push(entry);
    if (entry.warnings.length > 0) {
      console.warn(`[${index + 1}/${parsed.groups.length}] Warnings sku=${group.sku || "<missing>"}: ${entry.warnings.join(" | ")}`);
    }

    processed += 1;
    const elapsedMs = Date.now() - started;
    console.log(
      `[${index + 1}/${parsed.groups.length}] Done sku=${group.sku || "<missing>"} status=${entry.summary.status} elapsedMs=${elapsedMs}`
    );
    console.log(renderProgress(processed, parsed.groups.length));
  });

  if (parsed.groups.length > 0 && processed !== parsed.groups.length) {
    console.log(renderProgress(processed, parsed.groups.length));
  }

  const finishedAt = nowIso();
  reporter.finalizeSummary({
    runId,
    startedAt,
    finishedAt,
    durationMs: new Date(finishedAt).getTime() - new Date(startedAt).getTime(),
    csvPath,
    entries,
  });

  console.log(`Run complete. Log: ${reporter.path}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Import failed: ${message}`);
  process.exitCode = 1;
});
