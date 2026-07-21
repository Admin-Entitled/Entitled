#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const dotenv = require("dotenv");
const XLSX = require("xlsx");

const ENV_FILE_PATH = path.resolve(
  process.cwd(),
  process.env.ENV_FILE_PATH || path.join(__dirname, "..", "shopify-listing", ".env")
);
const ENV_BASE_DIR = path.dirname(ENV_FILE_PATH);

dotenv.config({ path: ENV_FILE_PATH });

const CONFIG = {
  excelFilePath:
    process.env.EXCEL_FILE_PATH ||
    process.env.CSV_PATH ||
    path.join(__dirname, "..", "shopify-listing", "data", "ARK_Apparel_Inventory_Master.xlsm"),
  sheetName: process.env.EXCEL_SHEET_NAME || "SHOPIFY_UPLOAD",
  columns: {
    productTitle: process.env.EXCEL_PRODUCT_TITLE_COLUMN || "",
    sku: process.env.EXCEL_SKU_COLUMN || "",
    alternateSku: process.env.EXCEL_ALT_SKU_COLUMN || "",
    size: process.env.EXCEL_SIZE_COLUMN || "",
    inventory: process.env.EXCEL_INVENTORY_COLUMN || "",
    sellingPrice: process.env.EXCEL_SELLING_PRICE_COLUMN || "",
  },
  shopify: {
    storeDomain: process.env.SHOPIFY_STORE || "your-store.myshopify.com",
    apiVersion: process.env.SHOPIFY_API_VERSION || "2025-01",
    locationId: process.env.SHOPIFY_LOCATION_ID || "",
    adminToken:
      process.env.SHOPIFY_ADMIN_TOKEN ||
      process.env.SHOPIFY_ACCESS_TOKEN ||
      process.env.SHOPIFY_TOKEN ||
      "",
    tokenUrl: process.env.SHOPIFY_TOKEN_URL || "",
    tokenGrantType: process.env.SHOPIFY_TOKEN_GRANT_TYPE || "client_credentials",
    clientId: process.env.SHOPIFY_CLIENT_ID || "",
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET || "",
    authCode: process.env.SHOPIFY_AUTH_CODE || "",
    refreshToken: process.env.SHOPIFY_REFRESH_TOKEN || "",
  },
  dryRun: parseBoolean(process.env.DRY_RUN, true),
  outputDir: process.env.OUTPUT_DIR || path.join(__dirname, "logs"),
  request: {
    timeoutMs: toPositiveInteger(process.env.REQUEST_TIMEOUT_MS, 30000),
    maxRetries: toPositiveInteger(process.env.MAX_RETRIES, 6),
    backoffBaseMs: toPositiveInteger(process.env.BACKOFF_BASE_MS, 500),
  },
};

const LOG_COLUMNS = [
  "excel_row_number",
  "product_name",
  "size",
  "sku",
  "alternate_sku",
  "transformed_sku",
  "excel_inventory",
  "excel_selling_price",
  "shopify_product_title",
  "shopify_variant_title",
  "shopify_sku",
  "current_shopify_inventory",
  "shopify_variant_price",
  "delta",
  "action_taken",
  "status",
  "reason",
];

const VALID_ACTIONS = new Set([
  "MATCHED_NO_CHANGE",
  "UPDATED",
  "UNMATCHED",
  "AMBIGUOUS_MATCH",
  "INVALID_SIZE",
  "INVALID_INVENTORY",
  "API_ERROR",
  "SKIPPED",
]);

async function main() {
  const startedAt = Date.now();
  const cliOverrides = parseCliArgs(process.argv.slice(2));
  const config = mergeConfig(CONFIG, cliOverrides);

  validateConfig(config);

  const token = await resolveShopifyToken(config.shopify);
  const shopifyClient = new ShopifyClient(config, token);

  const excelRows = readExcelRows(config);
  const summary = {
    total_excel_rows: excelRows.length,
    valid_rows: 0,
    matched_rows: 0,
    unmatched_rows: 0,
    ambiguous_rows: 0,
    mismatch_rows: 0,
    updated_rows: 0,
    skipped_rows: 0,
    failed_rows: 0,
    price_mismatch_rows: 0,
  };

  console.log(`Loaded ${excelRows.length} Excel rows from ${config.excelFilePath}`);
  console.log("Fetching Shopify products and variants...");

  const variants = await shopifyClient.fetchShopifyVariants();
  console.log(`Fetched ${variants.length} Shopify variants`);

  console.log("Fetching Shopify inventory levels...");
  await shopifyClient.populateInventoryLevels(variants);
  console.log("Inventory levels loaded");

  const matcher = buildMatcher(variants);
  const comparisonTable = [];
  const allLogs = [];
  const mismatchLogs = [];
  const updatesToApply = [];

  for (const row of excelRows) {
    const evaluation = evaluateExcelRow(row, matcher);
    if (evaluation.isValid) {
      summary.valid_rows += 1;
    } else {
      summary.skipped_rows += 1;
    }

    if (evaluation.log.status === "UNMATCHED") summary.unmatched_rows += 1;
    if (evaluation.log.status === "AMBIGUOUS_MATCH") summary.ambiguous_rows += 1;
    if (evaluation.log.status === "API_ERROR") summary.failed_rows += 1;

    if (isMismatchStatus(evaluation.log.status)) {
      allLogs.push(evaluation.log);
      mismatchLogs.push(evaluation.log);
    }

    if (!evaluation.variant || !evaluation.isValid) {
      if (!isMismatchStatus(evaluation.log.status)) {
        allLogs.push(evaluation.log);
      }
      continue;
    }

    summary.matched_rows += 1;

    const currentInventory = evaluation.variant.currentInventory;
    const delta = evaluation.row.excelInventory - currentInventory;
    const priceMismatch = hasPriceMismatch(evaluation.row.sellingPrice, evaluation.variant.price);
    comparisonTable.push({
      excel_row_number: evaluation.row.excelRowNumber,
      sku: evaluation.row.sku,
      product_name: evaluation.row.productName,
      size: evaluation.row.size,
      excel_inventory: evaluation.row.excelInventory,
      excel_selling_price: evaluation.row.sellingPrice,
      current_shopify_inventory: currentInventory,
      shopify_variant_price: evaluation.variant.price,
      delta,
      variant_id: evaluation.variant.id,
      inventory_item_id: evaluation.variant.inventoryItemId,
    });

    if (priceMismatch) {
      summary.price_mismatch_rows += 1;
    }

    if (delta !== 0) {
      summary.mismatch_rows += 1;
      updatesToApply.push({
        row: evaluation.row,
        variant: evaluation.variant,
        desiredInventory: evaluation.row.excelInventory,
        currentInventory,
        delta,
        priceMismatch,
      });
    } else {
      allLogs.push(
        createLogRow(
          evaluation.row,
          evaluation.variant,
          currentInventory,
          "MATCHED_NO_CHANGE",
          "MATCHED_NO_CHANGE",
          buildReason("Matched variant already has the target inventory", priceMismatch, evaluation.row, evaluation.variant)
        )
      );
    }
  }

  for (const job of updatesToApply) {
    const result = await applyInventoryUpdate(shopifyClient, job, config.dryRun);
    allLogs.push(result.log);
    if (isMismatchStatus(result.log.status)) {
      mismatchLogs.push(result.log);
    }

    if (result.log.status === "UPDATED") {
      summary.updated_rows += 1;
    }
    if (result.log.status === "API_ERROR") {
      summary.failed_rows += 1;
    }
  }

  ensureDir(config.outputDir);
  writeCsv(path.join(config.outputDir, "update_log.csv"), allLogs);
  writeCsv(path.join(config.outputDir, "mismatch_log.csv"), mismatchLogs);
  fs.writeFileSync(
    path.join(config.outputDir, "summary.json"),
    JSON.stringify(
      {
        ...summary,
        dry_run: config.dryRun,
        shopify_variant_count: variants.length,
        updates_planned: updatesToApply.length,
        comparison_table_size: comparisonTable.length,
        generated_at: new Date().toISOString(),
        execution_time_ms: Date.now() - startedAt,
      },
      null,
      2
    )
  );

  printConsoleSummary({
    ...summary,
    dryRun: config.dryRun,
    updatesPlanned: updatesToApply.length,
    outputDir: config.outputDir,
    durationMs: Date.now() - startedAt,
  });
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  return fallback;
}

function toPositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseCliArgs(argv) {
  const overrides = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--excel" && next) {
      overrides.excelFilePath = next;
      index += 1;
    } else if (arg === "--sheet" && next) {
      overrides.sheetName = next;
      index += 1;
    } else if (arg === "--productTitleColumn" && next) {
      overrides.columns = { ...(overrides.columns || {}), productTitle: next };
      index += 1;
    } else if (arg === "--skuColumn" && next) {
      overrides.columns = { ...(overrides.columns || {}), sku: next };
      index += 1;
    } else if (arg === "--alternateSkuColumn" && next) {
      overrides.columns = { ...(overrides.columns || {}), alternateSku: next };
      index += 1;
    } else if (arg === "--sizeColumn" && next) {
      overrides.columns = { ...(overrides.columns || {}), size: next };
      index += 1;
    } else if (arg === "--inventoryColumn" && next) {
      overrides.columns = { ...(overrides.columns || {}), inventory: next };
      index += 1;
    } else if (arg === "--store" && next) {
      overrides.shopify = { ...(overrides.shopify || {}), storeDomain: next };
      index += 1;
    } else if (arg === "--apiVersion" && next) {
      overrides.shopify = { ...(overrides.shopify || {}), apiVersion: next };
      index += 1;
    } else if (arg === "--locationId" && next) {
      overrides.shopify = { ...(overrides.shopify || {}), locationId: next };
      index += 1;
    } else if (arg === "--dryRun") {
      overrides.dryRun = true;
    } else if (arg === "--live") {
      overrides.dryRun = false;
    } else if (arg === "--outputDir" && next) {
      overrides.outputDir = next;
      index += 1;
    }
  }
  return overrides;
}

function mergeConfig(base, overrides) {
  const merged = {
    ...base,
    ...overrides,
    columns: { ...base.columns, ...(overrides.columns || {}) },
    shopify: { ...base.shopify, ...(overrides.shopify || {}) },
    request: { ...base.request, ...(overrides.request || {}) },
  };

  return {
    ...merged,
    columns: resolveColumnDefaults(merged.sheetName, merged.columns),
    excelFilePath: resolveInputPath(merged.excelFilePath),
    outputDir: resolveOutputPath(merged.outputDir),
  };
}

function validateConfig(config) {
  if (!fs.existsSync(config.excelFilePath)) {
    throw new Error(`Excel file not found: ${config.excelFilePath}`);
  }
  if (!config.sheetName) {
    throw new Error("sheetName is required");
  }
  if (!config.shopify.storeDomain) {
    throw new Error("shopify.storeDomain is required");
  }
  if (!config.shopify.locationId) {
    throw new Error("shopify.locationId is required");
  }
}

function resolveColumnDefaults(sheetName, columns) {
  const normalizedSheet = normalizeSheetName(sheetName);
  const defaults =
    normalizedSheet === "shopify_upload"
      ? {
          productTitle: "Title",
          sku: "AA",
          alternateSku: "A",
          size: "Size",
          inventory: "L",
          sellingPrice: "AB",
        }
      : {
          productTitle: "Style_Name",
          sku: "SKU",
          alternateSku: "",
          size: "Size",
          inventory: "V",
          sellingPrice: "AB",
        };

  return {
    productTitle: columns.productTitle || defaults.productTitle,
    sku: columns.sku || defaults.sku,
    alternateSku: columns.alternateSku || defaults.alternateSku,
    size: columns.size || defaults.size,
    inventory: columns.inventory || defaults.inventory,
    sellingPrice: columns.sellingPrice || defaults.sellingPrice,
  };
}

async function resolveShopifyToken(shopifyConfig) {
  if (shopifyConfig.adminToken) {
    return shopifyConfig.adminToken.trim();
  }

  if (!shopifyConfig.clientId || !shopifyConfig.clientSecret) {
    throw new Error(
      "Missing Shopify credentials. Set SHOPIFY_ADMIN_TOKEN or provide SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET in .env."
    );
  }

  const tokenUrl = shopifyConfig.tokenUrl || `https://${shopifyConfig.storeDomain}/admin/oauth/access_token`;
  const grantType = String(shopifyConfig.tokenGrantType || "client_credentials").trim();
  const form = new URLSearchParams();

  form.set("grant_type", grantType);
  form.set("client_id", shopifyConfig.clientId);
  form.set("client_secret", shopifyConfig.clientSecret);

  if (grantType === "authorization_code") {
    if (!shopifyConfig.authCode) {
      throw new Error("SHOPIFY_AUTH_CODE is required when SHOPIFY_TOKEN_GRANT_TYPE=authorization_code");
    }
    form.set("code", shopifyConfig.authCode);
  } else if (grantType === "refresh_token") {
    if (!shopifyConfig.refreshToken) {
      throw new Error("SHOPIFY_REFRESH_TOKEN is required when SHOPIFY_TOKEN_GRANT_TYPE=refresh_token");
    }
    form.set("refresh_token", shopifyConfig.refreshToken);
  }

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: form.toString(),
  });

  const payload = await safeJson(response);
  const token = typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!response.ok || !token) {
    throw new Error(
      `Failed to fetch Shopify token from ${tokenUrl}. Status=${response.status}. Response=${JSON.stringify(payload)}`
    );
  }

  return token;
}

function resolveInputPath(inputPath) {
  const raw = String(inputPath || "").trim();
  if (!raw) {
    return raw;
  }
  if (path.isAbsolute(raw)) {
    return raw;
  }

  const envRelative = path.resolve(ENV_BASE_DIR, raw);
  if (fs.existsSync(envRelative)) {
    return envRelative;
  }

  return path.resolve(__dirname, raw);
}

function resolveOutputPath(outputPath) {
  const raw = String(outputPath || "").trim();
  if (!raw) {
    return path.join(__dirname, "logs");
  }
  if (path.isAbsolute(raw)) {
    return raw;
  }
  return path.resolve(__dirname, raw);
}

function readExcelRows(config) {
  const workbook = XLSX.readFile(config.excelFilePath, { cellDates: false });
  const resolvedSheetName = resolveSheetName(workbook.SheetNames, config.sheetName);
  const worksheet = workbook.Sheets[resolvedSheetName];
  if (!worksheet) {
    throw new Error(`Sheet not found: ${config.sheetName}. Available sheets: ${workbook.SheetNames.join(", ")}`);
  }

  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  if (!rows.length) {
    return [];
  }

  const headerRow = rows[0];
  const titleIndex = resolveColumnIndex(headerRow, config.columns.productTitle, true);
  const skuIndex = resolveColumnIndex(headerRow, config.columns.sku, true);
  const alternateSkuIndex = resolveColumnIndex(headerRow, config.columns.alternateSku, true);
  const sizeIndex = resolveColumnIndex(headerRow, config.columns.size, true);
  const inventoryIndex = resolveColumnIndex(headerRow, config.columns.inventory);
  const sellingPriceIndex = resolveColumnIndex(headerRow, config.columns.sellingPrice, true);

  return rows.slice(1).map((rawRow, index) => ({
    excelRowNumber: index + 2,
    productName: titleIndex === null ? "" : toCellString(rawRow[titleIndex]),
    sku: skuIndex === null ? "" : toCellString(rawRow[skuIndex]),
    alternateSku: alternateSkuIndex === null ? "" : toCellString(rawRow[alternateSkuIndex]),
    transformedSku: buildShopifyComparableSku(
      skuIndex === null ? "" : toCellString(rawRow[skuIndex]),
      alternateSkuIndex === null ? "" : toCellString(rawRow[alternateSkuIndex])
    ),
    size: sizeIndex === null ? "" : toCellString(rawRow[sizeIndex]),
    normalizedSize: sizeIndex === null ? "" : normalizeSize(rawRow[sizeIndex]),
    excelInventory: parseInventory(rawRow[inventoryIndex]),
    sourceInventoryValue: rawRow[inventoryIndex],
    sellingPrice: sellingPriceIndex === null ? null : parsePrice(rawRow[sellingPriceIndex]),
  }));
}

function resolveSheetName(sheetNames, requestedSheetName) {
  const exact = sheetNames.find((name) => name === requestedSheetName);
  if (exact) {
    return exact;
  }

  const normalizedRequested = normalizeSheetName(requestedSheetName);
  const normalizedMatch = sheetNames.find((name) => normalizeSheetName(name) === normalizedRequested);
  if (normalizedMatch) {
    return normalizedMatch;
  }

  return requestedSheetName;
}

function normalizeSheetName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "_");
}

function resolveColumnIndex(headerRow, reference, allowMissing = false) {
  if (reference === null || reference === undefined || reference === "") {
    if (allowMissing) return null;
    throw new Error("Column reference is required");
  }

  const ref = String(reference).trim();
  if (/^[A-Za-z]+$/.test(ref) && ref.length <= 3) {
    return columnLetterToIndex(ref);
  }

  const normalizedRef = normalizeText(ref);
  const matchIndex = headerRow.findIndex((header) => normalizeText(header) === normalizedRef);
  if (matchIndex >= 0) {
    return matchIndex;
  }

  if (allowMissing) {
    return null;
  }
  throw new Error(`Column not found in sheet: ${reference}`);
}

function columnLetterToIndex(letters) {
  let result = 0;
  const upper = String(letters).trim().toUpperCase();
  for (const char of upper) {
    result = result * 26 + (char.charCodeAt(0) - 64);
  }
  return result - 1;
}

function toCellString(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function parseInventory(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const normalized = String(value).replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.trunc(parsed);
}

function parsePrice(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const normalized = String(value).replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function normalizeText(value) {
  return String(value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeSku(value) {
  return normalizeText(value).replace(/\s+/g, "").replace(/[^a-z0-9_-]/g, "");
}

function transformExcelSkuToShopifyFormat(rawSku) {
  const raw = String(rawSku ?? "").trim();
  if (!raw) {
    return "";
  }

  const parts = raw
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    return `${parts[0]}-${parts[parts.length - 1]}`;
  }

  return raw.replace(/\|/g, "-");
}

function buildShopifyComparableSku(primarySku, alternateSku) {
  const transformedPrimary = transformExcelSkuToShopifyFormat(primarySku);
  if (transformedPrimary) {
    return transformedPrimary;
  }

  const transformedAlternate = transformExcelSkuToShopifyFormat(alternateSku);
  if (transformedAlternate) {
    return transformedAlternate;
  }

  return "";
}

function normalizeSize(value) {
  const raw = normalizeText(value).replace(/\./g, "").replace(/\s*-\s*/g, "-");
  if (!raw) return "";

  const compact = raw.replace(/\s+/g, "");
  const map = new Map([
    ["xs", "xs"],
    ["extrasmall", "xs"],
    ["extra-small", "xs"],
    ["s", "s"],
    ["small", "s"],
    ["m", "m"],
    ["medium", "m"],
    ["l", "l"],
    ["large", "l"],
    ["xl", "xl"],
    ["xlarge", "xl"],
    ["extra-large", "xl"],
    ["xxl", "xxl"],
    ["2xl", "xxl"],
    ["xx-large", "xxl"],
    ["xxxl", "xxxl"],
    ["3xl", "xxxl"],
    ["xxxxl", "xxxxl"],
    ["4xl", "xxxxl"],
  ]);

  if (map.has(compact)) {
    return map.get(compact);
  }

  return compact;
}

function buildMatcher(variants) {
  const skuIndex = new Map();
  const skuFamilyIndex = new Map();

  for (const variant of variants) {
    if (variant.normalizedSku) {
      pushIndex(skuIndex, variant.normalizedSku, variant);
      const familyKey = buildSkuFamilyKey(variant.sku);
      if (familyKey) {
        pushIndex(skuFamilyIndex, familyKey, variant);
      }
    }
  }

  return { skuIndex, skuFamilyIndex };
}

function pushIndex(map, key, value) {
  const existing = map.get(key);
  if (existing) {
    existing.push(value);
  } else {
    map.set(key, [value]);
  }
}

function buildSkuFamilyKey(rawSku) {
  const raw = String(rawSku || "").trim();
  if (!raw) return "";
  const transformed = transformExcelSkuToShopifyFormat(raw);
  const match = transformed.match(/^(.*)-([A-Za-z0-9]+)$/);
  if (!match) {
    return normalizeSku(transformed);
  }
  return normalizeSku(match[1]);
}

function evaluateExcelRow(row, matcher) {
  const transformedSku = normalizeSku(row.transformedSku);
  const primarySku = normalizeSku(row.sku);
  const alternateSku = normalizeSku(row.alternateSku);
  const effectiveSku = transformedSku || primarySku || alternateSku;

  if (!effectiveSku) {
    return {
      row,
      variant: null,
      isValid: false,
      log: createLogRow(row, null, null, "SKIPPED", "SKIPPED", "Missing variant SKU"),
    };
  }

  if (row.excelInventory === null || row.excelInventory < 0) {
    return {
      row,
      variant: null,
      isValid: false,
      log: createLogRow(
        row,
        null,
        null,
        "INVALID_INVENTORY",
        "INVALID_INVENTORY",
        `Invalid inventory value in source column: ${String(row.sourceInventoryValue)}`
      ),
    };
  }

  let skuMatches = transformedSku ? matcher.skuIndex.get(transformedSku) || [] : [];
  let matchedBy = "transformed";
  if (skuMatches.length === 0 && primarySku) {
    skuMatches = matcher.skuIndex.get(primarySku) || [];
    matchedBy = "primary";
  }
  if (skuMatches.length === 0 && alternateSku) {
    skuMatches = matcher.skuIndex.get(alternateSku) || [];
    matchedBy = "alternate";
  }
  if (skuMatches.length > 1) {
    return {
      row,
      variant: null,
      isValid: false,
      log: createLogRow(row, null, null, "AMBIGUOUS_MATCH", "AMBIGUOUS_MATCH", "Multiple Shopify variants matched SKU"),
    };
  }
  if (skuMatches.length === 1) {
    const variant = skuMatches[0];
    if (!variant.inventoryItemId) {
      return {
        row,
        variant: null,
        isValid: false,
        log: createLogRow(
          row,
          variant,
          variant.currentInventory,
          "SKIPPED",
          "SKIPPED",
          "Matched variant has no inventory item ID"
        ),
      };
    }

    return {
      row,
      variant,
      isValid: true,
      log: createLogRow(
        row,
        variant,
        variant.currentInventory,
        "MATCHED_NO_CHANGE",
        "MATCHED_NO_CHANGE",
        matchedBy === "transformed"
          ? `Matched by transformed SKU (${row.transformedSku})`
          : matchedBy === "alternate"
            ? "Matched by alternate SKU"
            : "Matched by SKU"
      ),
    };
  }

  return {
    row,
    variant: null,
    isValid: false,
    log: createLogRow(
      row,
      null,
      null,
      "UNMATCHED",
      "UNMATCHED",
      buildUnmatchedReason(row, matcher)
    ),
  };
}

function buildUnmatchedReason(row, matcher) {
  const transformed = row?.transformedSku || row?.sku || row?.alternateSku || "";
  const familyKey = buildSkuFamilyKey(transformed);
  const related = familyKey ? matcher.skuFamilyIndex.get(familyKey) || [] : [];
  if (!related.length) {
    return "No Shopify variant matched SKU";
  }

  const relatedSkus = [...new Set(related.map((variant) => variant.sku).filter(Boolean))].sort();
  return `No exact Shopify SKU matched. Related Shopify SKUs found: ${relatedSkus.join(" | ")}`;
}

function createLogRow(row, variant, currentInventory, actionTaken, status, reason) {
  if (!VALID_ACTIONS.has(actionTaken) || !VALID_ACTIONS.has(status)) {
    throw new Error(`Unsupported log action/status: ${actionTaken}/${status}`);
  }

  const delta =
    typeof row?.excelInventory === "number" && typeof currentInventory === "number"
      ? row.excelInventory - currentInventory
      : "";

  return {
    excel_row_number: row?.excelRowNumber ?? "",
    product_name: row?.productName ?? "",
    size: row?.size ?? "",
    sku: row?.sku ?? "",
    alternate_sku: row?.alternateSku ?? "",
    transformed_sku: row?.transformedSku ?? "",
    excel_inventory: row?.excelInventory ?? "",
    excel_selling_price: row?.sellingPrice ?? "",
    shopify_product_title: variant?.productTitle ?? "",
    shopify_variant_title: variant?.variantTitle ?? "",
    shopify_sku: variant?.sku ?? "",
    current_shopify_inventory: typeof currentInventory === "number" ? currentInventory : "",
    shopify_variant_price: variant?.price ?? "",
    delta,
    action_taken: actionTaken,
    status,
    reason,
  };
}

function isMismatchStatus(status) {
  return new Set([
    "UNMATCHED",
    "AMBIGUOUS_MATCH",
    "INVALID_SIZE",
    "INVALID_INVENTORY",
    "API_ERROR",
    "SKIPPED",
    "UPDATED",
  ]).has(status);
}

async function applyInventoryUpdate(client, job, dryRun) {
  const actionTaken = dryRun ? "SKIPPED" : "UPDATED";
  const status = dryRun ? "SKIPPED" : "UPDATED";
  const baseReason = dryRun ? "Dry run only; inventory update not executed" : "Inventory updated successfully";
  try {
    if (!dryRun) {
      await client.updateInventory(job.variant.inventoryItemId, job.desiredInventory);
      job.variant.currentInventory = job.desiredInventory;
    }

    return {
      log: createLogRow(
        job.row,
        job.variant,
        job.currentInventory,
        actionTaken,
        status,
        buildReason(`${baseReason}. Delta=${job.delta}`, job.priceMismatch, job.row, job.variant)
      ),
    };
  } catch (error) {
    return {
      log: createLogRow(
        job.row,
        job.variant,
        job.currentInventory,
        "API_ERROR",
        "API_ERROR",
        error instanceof Error ? error.message : String(error)
      ),
    };
  }
}

class ShopifyClient {
  constructor(config, adminToken) {
    this.config = config;
    this.adminToken = adminToken;
    this.baseUrl = `https://${config.shopify.storeDomain}/admin/api/${config.shopify.apiVersion}`;
  }

  async fetchShopifyVariants() {
    const variants = [];
    let nextPageInfo = null;

    do {
      const query = new URLSearchParams();
      query.set("limit", "250");
      query.set("fields", "id,title,variants,options");
      if (nextPageInfo) {
        query.set("page_info", nextPageInfo);
      }

      const response = await this.request("GET", `/products.json?${query.toString()}`);
      const products = Array.isArray(response.body.products) ? response.body.products : [];

      for (const product of products) {
        const sizeOptionPosition = findSizeOptionPosition(product.options);
        for (const variant of Array.isArray(product.variants) ? product.variants : []) {
          const sizeValue = extractVariantSize(variant, sizeOptionPosition);
          variants.push({
            id: String(variant.id),
            productId: String(product.id),
            productTitle: String(product.title || ""),
            normalizedProductTitle: normalizeText(product.title || ""),
            variantTitle: String(variant.title || ""),
            sku: String(variant.sku || ""),
            normalizedSku: normalizeSku(variant.sku || ""),
            price: parsePrice(variant.price),
            inventoryItemId: String(variant.inventory_item_id || ""),
            sizeValue,
            normalizedSize: normalizeSize(sizeValue || variant.title || ""),
            currentInventory: 0,
          });
        }
      }

      nextPageInfo = extractNextPageInfo(response.headers.link);
    } while (nextPageInfo);

    return variants;
  }

  async populateInventoryLevels(variants) {
    const inventoryItemIds = [...new Set(variants.map((variant) => variant.inventoryItemId).filter(Boolean))];
    const inventoryByItemId = new Map();
    const locationId = parseShopifyGid(this.config.shopify.locationId);

    for (const chunk of chunkArray(inventoryItemIds, 50)) {
      const query = new URLSearchParams();
      query.set("location_ids", locationId);
      query.set("inventory_item_ids", chunk.join(","));
      const response = await this.request("GET", `/inventory_levels.json?${query.toString()}`);
      const levels = Array.isArray(response.body.inventory_levels) ? response.body.inventory_levels : [];
      for (const level of levels) {
        inventoryByItemId.set(String(level.inventory_item_id), Number(level.available || 0));
      }
    }

    for (const variant of variants) {
      variant.currentInventory = inventoryByItemId.has(variant.inventoryItemId)
        ? inventoryByItemId.get(variant.inventoryItemId)
        : 0;
    }
  }

  async updateInventory(inventoryItemId, available) {
    await this.request("POST", "/inventory_levels/set.json", {
      location_id: parseShopifyGid(this.config.shopify.locationId),
      inventory_item_id: Number.parseInt(parseShopifyGid(inventoryItemId), 10) || Number.parseInt(inventoryItemId, 10),
      available,
    });
  }

  async request(method, endpoint, body = undefined, attempt = 0) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.request.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-Shopify-Access-Token": this.adminToken,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      const payload = await safeJson(response);
      if (response.status === 429 && attempt < this.config.request.maxRetries) {
        await sleep(computeBackoff(attempt, response.headers.get("retry-after"), this.config.request.backoffBaseMs));
        return this.request(method, endpoint, body, attempt + 1);
      }

      if (!response.ok) {
        if (attempt < this.config.request.maxRetries && isRetryableStatus(response.status)) {
          await sleep(computeBackoff(attempt, response.headers.get("retry-after"), this.config.request.backoffBaseMs));
          return this.request(method, endpoint, body, attempt + 1);
        }
        throw new Error(`Shopify API ${method} ${endpoint} failed with status ${response.status}: ${JSON.stringify(payload)}`);
      }

      await this.delayForCallLimit(response.headers.get("x-shopify-shop-api-call-limit"));
      return { body: payload, headers: headersToObject(response.headers) };
    } finally {
      clearTimeout(timer);
    }
  }

  async delayForCallLimit(callLimitHeader) {
    if (!callLimitHeader) return;
    const [usedRaw, bucketRaw] = String(callLimitHeader).split("/");
    const used = Number.parseInt(usedRaw, 10);
    const bucket = Number.parseInt(bucketRaw, 10);
    if (Number.isInteger(used) && Number.isInteger(bucket) && bucket > 0) {
      const ratio = used / bucket;
      if (ratio >= 0.8) {
        await sleep(500);
      }
    }
  }
}

function findSizeOptionPosition(options) {
  if (!Array.isArray(options)) return null;
  const sizeOption = options.find((option) => normalizeText(option.name) === "size");
  return sizeOption && Number.isInteger(sizeOption.position) ? sizeOption.position : null;
}

function extractVariantSize(variant, sizeOptionPosition) {
  if (sizeOptionPosition === 1) return variant.option1 || "";
  if (sizeOptionPosition === 2) return variant.option2 || "";
  if (sizeOptionPosition === 3) return variant.option3 || "";
  if (variant.option1 && normalizeText(variant.title) !== "default title") return variant.option1;
  if (variant.title && normalizeText(variant.title) !== "default title") return variant.title;
  return "";
}

function extractNextPageInfo(linkHeader) {
  if (!linkHeader) return null;
  const parts = String(linkHeader).split(",");
  for (const part of parts) {
    if (!/rel="?next"?/.test(part)) continue;
    const match = part.match(/<([^>]+)>/);
    if (!match) continue;
    const url = new URL(match[1]);
    return url.searchParams.get("page_info");
  }
  return null;
}

function headersToObject(headers) {
  const result = {};
  for (const [key, value] of headers.entries()) {
    result[key] = value;
  }
  return result;
}

function computeBackoff(attempt, retryAfterHeader, baseMs) {
  const retryAfterSeconds = Number.parseFloat(String(retryAfterHeader || ""));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return Math.ceil(retryAfterSeconds * 1000);
  }
  return Math.min(10000, baseMs * 2 ** attempt);
}

function isRetryableStatus(status) {
  return [408, 409, 423, 425, 429, 500, 502, 503, 504].includes(status);
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function parseShopifyGid(value) {
  const raw = String(value || "").trim();
  if (!raw.startsWith("gid://")) {
    return raw;
  }
  const parts = raw.split("/");
  return parts[parts.length - 1];
}

async function safeJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeCsv(filePath, rows) {
  const lines = [LOG_COLUMNS.map((column) => csvEscape(column)).join(",")];
  for (const row of rows) {
    lines.push(LOG_COLUMNS.map((column) => csvEscape(row[column])).join(","));
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`);
}

function csvEscape(value) {
  const stringValue = value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function printConsoleSummary(summary) {
  console.log("");
  console.log("Inventory sync summary");
  console.log("----------------------");
  console.log(`Dry run: ${summary.dryRun}`);
  console.log(`Total Excel rows: ${summary.total_excel_rows}`);
  console.log(`Valid rows: ${summary.valid_rows}`);
  console.log(`Matched rows: ${summary.matched_rows}`);
  console.log(`Unmatched rows: ${summary.unmatched_rows}`);
  console.log(`Ambiguous rows: ${summary.ambiguous_rows}`);
  console.log(`Inventory mismatches: ${summary.mismatch_rows}`);
  console.log(`Updates planned: ${summary.updatesPlanned}`);
  console.log(`Updated rows: ${summary.updated_rows}`);
  console.log(`Skipped rows: ${summary.skipped_rows}`);
  console.log(`Failed rows: ${summary.failed_rows}`);
  console.log(`Price mismatches: ${summary.price_mismatch_rows}`);
  console.log(`Output directory: ${summary.outputDir}`);
  console.log(`Execution time: ${summary.durationMs} ms`);
}

function hasPriceMismatch(excelPrice, shopifyPrice) {
  if (excelPrice === null || shopifyPrice === null || shopifyPrice === undefined) {
    return false;
  }
  return Math.abs(Number(excelPrice) - Number(shopifyPrice)) > 0.0001;
}

function buildReason(baseReason, priceMismatch, row, variant) {
  if (!priceMismatch) {
    return baseReason;
  }
  return `${baseReason}. Price mismatch detected (Excel=${row?.sellingPrice ?? ""}, Shopify=${variant?.price ?? ""})`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
