import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { execFileSync } from "node:child_process";
import { dedupeStrings, normalizeStatus, toNumber, toStringClean } from "./utils";

export const HEADER_MAPPING = {
  title: ["title", "product_title", "product_name", "name"],
  vendor: ["vendor", "brand"],
  productType: ["product_type", "producttype", "type"],
  sku: ["sku", "style_sku", "product_sku", "article_no"],
  color: ["color", "colour"],
  sellingPrice: ["selling_price", "sellingprice", "price"],
  status: ["status", "product_status"],
  barcode: ["barcode", "upc", "ean"],
  size: ["size", "variant_size"],
  availableQty: ["availableqty", "available_qty", "qty", "quantity"],
  chestTag: ["chest_tag", "chestsize", "chest_size"],
} as const;

const KNOWN_SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL"];
const ALLOWED_PRODUCT_TYPES = ["RN", "Polo", "Shirt", "Denim Shirt", "Linen Shirt"] as const;

interface CsvRow {
  rowIndex: number;
  values: Record<string, string>;
}

export interface ParsedVariantInput {
  size: string;
  qty: number;
  barcode?: string;
}

export interface ParsedSkuGroup {
  sku: string;
  rowIndexes: number[];
  title: string;
  vendor: string;
  productType: string;
  color: string;
  sellingPrice: number;
  status: "ACTIVE" | "DRAFT";
  variants: ParsedVariantInput[];
  tags: string[];
  warnings: string[];
  validationErrors: string[];
  derivedFieldsUsed: {
    chestSizeTagsBySize: Record<string, string>;
    sizeColumnsDetected: string[];
    qtyColumnsDetected: string[];
    rowBasedDetected: boolean;
  };
}

export interface ParseResult {
  groups: ParsedSkuGroup[];
  totalRows: number;
  sourceSheet?: string;
  itemVariantSheet?: string;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeSize(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeProductType(value: string): string {
  const cleaned = toStringClean(value);
  const folded = cleaned.toLowerCase().replace(/\s+/g, " ").trim();
  const match = ALLOWED_PRODUCT_TYPES.find((allowed) => allowed.toLowerCase() === folded);
  return match ?? cleaned;
}

function isAllowedProductType(value: string): boolean {
  const folded = toStringClean(value).toLowerCase().replace(/\s+/g, " ").trim();
  return ALLOWED_PRODUCT_TYPES.some((allowed) => allowed.toLowerCase() === folded);
}

function findColumn(headers: string[], aliases: readonly string[]): string | null {
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const found = headers.find((h) => normalizeHeader(h) === target);
    if (found) return found;
  }
  return null;
}

function parseCsvText(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let i = 0;
  let inQuotes = false;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          value += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      value += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === ",") {
      row.push(value);
      value = "";
      i += 1;
      continue;
    }

    if (ch === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      i += 1;
      continue;
    }

    if (ch === "\r") {
      i += 1;
      continue;
    }

    value += ch;
    i += 1;
  }

  row.push(value);
  if (row.length > 1 || row[0].trim() !== "") {
    rows.push(row);
  }

  return rows;
}

function parseSpreadsheetFile(path: string): {
  records: string[][];
  sourceSheet: string;
  itemVariantRecords: string[][];
  itemVariantSheet?: string;
} {
  const script = `
import datetime
import json
import sys
import openpyxl

path = sys.argv[1]

def norm(value):
    return str(value).strip().lower().replace(" ", "_") if value is not None else ""

title_aliases = {"title", "product_title", "product_name", "name"}
sku_aliases = {"sku", "style_sku", "product_sku", "article_no"}
price_aliases = {"selling_price", "sellingprice", "price"}

def score(headers):
    header_set = set(headers)
    return sum([
        1 if any(alias in header_set for alias in title_aliases) else 0,
        1 if any(alias in header_set for alias in sku_aliases) else 0,
        1 if any(alias in header_set for alias in price_aliases) else 0,
    ])

wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

best_sheet = wb.sheetnames[0] if wb.sheetnames else "Sheet1"
best_score = -1
for sheet_name in wb.sheetnames:
    ws = wb[sheet_name]
    header_row = next(ws.iter_rows(min_row=1, max_row=1, values_only=True), tuple())
    headers = [norm(v) for v in header_row if v is not None and str(v).strip() != ""]
    sc = score(headers)
    if sc > best_score or (sc == best_score and sheet_name == "SHOPIFY_UPLOAD"):
        best_sheet = sheet_name
        best_score = sc

ws = wb[best_sheet]
records = []
for i, row in enumerate(ws.iter_rows(values_only=True)):
    out = []
    has_data = False
    for cell in row:
        if cell is None:
            text = ""
        elif isinstance(cell, (datetime.datetime, datetime.date)):
            text = cell.isoformat()
        else:
            text = str(cell).strip()
        if text != "":
            has_data = True
        out.append(text)
    if i == 0 or has_data:
        records.append(out)

item_variant_sheet = None
for sheet_name in wb.sheetnames:
    if str(sheet_name).strip().lower() == "item_variant_master":
        item_variant_sheet = sheet_name
        break

item_variant_records = []
if item_variant_sheet:
    ws_item = wb[item_variant_sheet]
    for i, row in enumerate(ws_item.iter_rows(values_only=True)):
        out = []
        has_data = False
        for cell in row:
            if cell is None:
                text = ""
            elif isinstance(cell, (datetime.datetime, datetime.date)):
                text = cell.isoformat()
            else:
                text = str(cell).strip()
            if text != "":
                has_data = True
            out.append(text)
        if i == 0 or has_data:
            item_variant_records.append(out)

print(
    json.dumps(
        {
            "sheet": best_sheet,
            "records": records,
            "itemVariantSheet": item_variant_sheet,
            "itemVariantRecords": item_variant_records,
        },
        ensure_ascii=True,
    )
)
`.trim();

  try {
    const output = execFileSync("python3", ["-c", script, path], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    const parsed = JSON.parse(output) as {
      sheet?: string;
      records?: string[][];
      itemVariantSheet?: string;
      itemVariantRecords?: string[][];
    };
    return {
      sourceSheet: parsed.sheet ?? "unknown",
      records: Array.isArray(parsed.records) ? parsed.records : [],
      itemVariantSheet: parsed.itemVariantSheet ? String(parsed.itemVariantSheet) : undefined,
      itemVariantRecords: Array.isArray(parsed.itemVariantRecords) ? parsed.itemVariantRecords : [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Unable to read spreadsheet input. Ensure python3 and openpyxl are installed, or export CSV instead. Details: ${message}`
    );
  }
}

function loadInputRecords(path: string): {
  records: string[][];
  sourceSheet?: string;
  itemVariantRecords?: string[][];
  itemVariantSheet?: string;
} {
  const ext = extname(path).toLowerCase();
  if (ext === ".csv" || ext === ".txt") {
    const csvRaw = readFileSync(path, "utf8");
    return { records: parseCsvText(csvRaw) };
  }

  if (ext === ".xlsx" || ext === ".xlsm" || ext === ".xls") {
    return parseSpreadsheetFile(path);
  }

  throw new Error(`Unsupported input type '${ext || "unknown"}'. Use .csv, .xlsx, or .xlsm.`);
}

function toPositiveInteger(value: string): number | null {
  const n = Number(value.trim());
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return null;
  return Math.trunc(n);
}

function deriveChestTag(size: string, raw: string): string {
  const cleaned = toStringClean(raw);
  if (!cleaned) return "";
  if (/chest/i.test(cleaned)) return cleaned;
  return `${size} Chest Size: ${cleaned}`;
}

function fallbackChestTag(size: string): string {
  return `${size} Chest Size: N/A`;
}

function formatChestValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function deriveTags(input: {
  brand: string;
  type: string;
  color: string;
  chestBySize: Record<string, string>;
}): string[] {
  const tags: string[] = [];
  if (input.brand) tags.push(`brand:${input.brand}`);
  if (input.type) tags.push(`type:${input.type}`);
  if (input.color) tags.push(`color:${input.color}`);
  tags.push(...Object.values(input.chestBySize).filter(Boolean));
  tags.push("source:csv", "import:cli");
  return dedupeStrings(tags);
}

function buildRows(records: string[][]): CsvRow[] {
  if (records.length === 0) return [];
  const headers = records[0].map((h) => toStringClean(h));
  const rows: CsvRow[] = [];

  for (let i = 1; i < records.length; i += 1) {
    const r = records[i];
    const values: Record<string, string> = {};
    for (let c = 0; c < headers.length; c += 1) {
      values[headers[c]] = toStringClean(r[c] ?? "");
    }

    const hasData = Object.values(values).some((v) => v !== "");
    if (!hasData) continue;

    rows.push({ rowIndex: i + 1, values });
  }

  return rows;
}

function buildItemVariantMetaBySku(records: string[][] | undefined): Map<
  string,
  {
    brand: string;
    type: string;
    colour: string;
    chestAvgBySize: Record<string, string>;
  }
> {
  const bySku = new Map<
    string,
    {
      brand: string;
      type: string;
      colour: string;
      chestTotalsBySize: Map<string, { sum: number; count: number }>;
    }
  >();
  if (!records || records.length <= 1) return new Map();

  for (let i = 1; i < records.length; i += 1) {
    const row = records[i] ?? [];
    const sku = toStringClean(row[29] ?? "");
    if (!sku) continue;

    const existing = bySku.get(sku) ?? { brand: "", type: "", colour: "", chestTotalsBySize: new Map() };
    const brand = toStringClean(row[4] ?? "");
    const type = toStringClean(row[6] ?? "");
    const colour = toStringClean(row[15] ?? "");
    const size = normalizeSize(toStringClean(row[16] ?? ""));
    const chest = toNumber(row[18]);

    if (size && chest !== null && Number.isFinite(chest)) {
      const agg = existing.chestTotalsBySize.get(size) ?? { sum: 0, count: 0 };
      agg.sum += chest;
      agg.count += 1;
      existing.chestTotalsBySize.set(size, agg);
    }

    bySku.set(sku, {
      brand: existing.brand || brand,
      type: existing.type || type,
      colour: existing.colour || colour,
      chestTotalsBySize: existing.chestTotalsBySize,
    });
  }

  const finalized = new Map<
    string,
    {
      brand: string;
      type: string;
      colour: string;
      chestAvgBySize: Record<string, string>;
    }
  >();

  for (const [sku, meta] of bySku.entries()) {
    const chestAvgBySize: Record<string, string> = {};
    for (const [size, agg] of meta.chestTotalsBySize.entries()) {
      if (agg.count > 0) {
        chestAvgBySize[size] = formatChestValue(agg.sum / agg.count);
      }
    }
    finalized.set(sku, {
      brand: meta.brand,
      type: meta.type,
      colour: meta.colour,
      chestAvgBySize,
    });
  }

  return finalized;
}

export function parseCsvFile(csvPath: string): ParseResult {
  const loaded = loadInputRecords(csvPath);
  const records = loaded.records;
  const itemVariantMetaBySku = buildItemVariantMetaBySku(loaded.itemVariantRecords);
  if (records.length === 0) {
    return {
      groups: [],
      totalRows: 0,
      sourceSheet: loaded.sourceSheet,
      itemVariantSheet: loaded.itemVariantSheet,
    };
  }

  const headers = records[0].map((h) => toStringClean(h));
  const skuCol = findColumn(headers, HEADER_MAPPING.sku);
  const sellingPriceCol = findColumn(headers, HEADER_MAPPING.sellingPrice);
  const statusCol = findColumn(headers, HEADER_MAPPING.status);
  const barcodeCol = findColumn(headers, HEADER_MAPPING.barcode);
  const rowSizeCol = findColumn(headers, HEADER_MAPPING.size);
  const rowQtyCol = findColumn(headers, HEADER_MAPPING.availableQty);
  const rowChestCol = findColumn(headers, HEADER_MAPPING.chestTag);

  if (!skuCol || !sellingPriceCol) {
    const preview = headers.filter(Boolean).slice(0, 16).join(", ");
    throw new Error(
      `Required columns missing (sku, sellingPrice). Detected headers: [${preview}]${
        loaded.sourceSheet ? ` in sheet '${loaded.sourceSheet}'` : ""
      }`
    );
  }

  const headerByNormalized = new Map(headers.map((h) => [normalizeHeader(h), h]));
  const sizeColumnsDetected: string[] = [];
  const qtyColumnsDetected: string[] = [];
  const chestColumnBySize = new Map<string, string>();
  const tagColumnBySize = new Map<string, string>();

  for (const size of KNOWN_SIZES) {
    const direct = headerByNormalized.get(size.toLowerCase());
    if (direct) sizeColumnsDetected.push(size);

    const qty = headerByNormalized.get(`qty_${size.toLowerCase()}`);
    if (qty) qtyColumnsDetected.push(qty);

    const chest = headerByNormalized.get(`chest_${size.toLowerCase()}`);
    if (chest) chestColumnBySize.set(size, chest);

    const tag = headerByNormalized.get(`${size.toLowerCase()}_tag`);
    if (tag) tagColumnBySize.set(size, tag);
  }

  const rows = buildRows(records);
  const rowsBySku = new Map<string, CsvRow[]>();

  for (const row of rows) {
    const sku = toStringClean(row.values[skuCol]);
    const key = sku || `__MISSING_SKU__${row.rowIndex}`;
    if (!rowsBySku.has(key)) rowsBySku.set(key, []);
    rowsBySku.get(key)!.push(row);
  }

  const groups: ParsedSkuGroup[] = [];
  const rowBasedDetected = Boolean(rowSizeCol && rowQtyCol);

  for (const [groupKey, groupedRows] of rowsBySku.entries()) {
    const first = groupedRows[0];
    const sku = groupKey.startsWith("__MISSING_SKU__") ? "" : groupKey;
    const meta = itemVariantMetaBySku.get(sku);
    const brand = toStringClean(meta?.brand ?? "");
    const productTypeRaw = toStringClean(meta?.type ?? "");
    const productType = normalizeProductType(productTypeRaw);
    const color = toStringClean(meta?.colour ?? "");
    const chestAvgBySize = meta?.chestAvgBySize ?? {};
    const title = toStringClean(`${brand} |  ${productType} |  ${color}`);
    const vendor = brand;

    const warnings: string[] = [];
    const validationErrors: string[] = [];
    const chestSizeTagsBySize: Record<string, string> = {};
    const variantMap = new Map<string, ParsedVariantInput>();

    if (!brand) warnings.push("brand missing in item_variant_master (col E)");
    if (!productType) warnings.push("type missing in item_variant_master (col G)");
    if (!color) warnings.push("color missing");

    if (!sku) validationErrors.push("sku is empty");
    if (!brand) validationErrors.push("brand missing from item_variant_master (col E)");
    if (!productType) validationErrors.push("type missing from item_variant_master (col G)");
    if (productType && !isAllowedProductType(productType)) {
      validationErrors.push(
        `invalid product type '${productType}' in item_variant_master (allowed: ${ALLOWED_PRODUCT_TYPES.join(", ")})`
      );
    }

    const parsedPrices = groupedRows
      .map((r) => toNumber(r.values[sellingPriceCol]))
      .filter((n): n is number => n !== null && Number.isFinite(n));
    const sellingPrice = parsedPrices.length > 0 ? parsedPrices[0] : NaN;

    if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
      validationErrors.push("sellingPrice must be a number > 0");
    }

    if (parsedPrices.some((p) => Math.abs(p - sellingPrice) > 0.000001)) {
      warnings.push("multiple sellingPrice values for same SKU; first non-empty value used");
    }

    const rawStatus = statusCol ? toStringClean(first.values[statusCol]) : "";
    const normalizedStatus = rawStatus ? normalizeStatus(rawStatus) : null;
    const status: "ACTIVE" | "DRAFT" = normalizedStatus ?? "DRAFT";
    if (rawStatus && !normalizedStatus) {
      warnings.push(`invalid status '${rawStatus}' mapped to DRAFT`);
    }

    for (const row of groupedRows) {
      const barcode = barcodeCol ? toStringClean(row.values[barcodeCol]) : "";

      for (const size of sizeColumnsDetected) {
        const colName = headerByNormalized.get(size.toLowerCase());
        if (!colName) continue;

        const qty = toPositiveInteger(row.values[colName] ?? "");
        if (!qty) continue;

        const existing = variantMap.get(size);
        if (existing) existing.qty += qty;
        else variantMap.set(size, { size, qty, ...(barcode ? { barcode } : {}) });

        const avgChestValue = chestAvgBySize[size] ?? "";
        const chestValue = chestColumnBySize.get(size) ? row.values[chestColumnBySize.get(size)!] : "";
        const tagValue = tagColumnBySize.get(size) ? row.values[tagColumnBySize.get(size)!] : "";
        const chestTag = deriveChestTag(size, avgChestValue || chestValue || tagValue || "");
        if (chestTag) chestSizeTagsBySize[size] = chestTag;
      }

      for (const qtyCol of qtyColumnsDetected) {
        const size = normalizeSize(qtyCol.slice(4));
        const qty = toPositiveInteger(row.values[qtyCol] ?? "");
        if (!qty) continue;

        const existing = variantMap.get(size);
        if (existing) existing.qty += qty;
        else variantMap.set(size, { size, qty, ...(barcode ? { barcode } : {}) });

        const avgChestValue = chestAvgBySize[size] ?? "";
        const chestValue = chestColumnBySize.get(size) ? row.values[chestColumnBySize.get(size)!] : "";
        const tagValue = tagColumnBySize.get(size) ? row.values[tagColumnBySize.get(size)!] : "";
        const chestTag = deriveChestTag(size, avgChestValue || chestValue || tagValue || "");
        if (chestTag) chestSizeTagsBySize[size] = chestTag;
      }

      if (rowSizeCol && rowQtyCol) {
        const size = normalizeSize(row.values[rowSizeCol] ?? "");
        const qty = toPositiveInteger(row.values[rowQtyCol] ?? "");
        if (size && qty) {
          const existing = variantMap.get(size);
          if (existing) existing.qty += qty;
          else variantMap.set(size, { size, qty, ...(barcode ? { barcode } : {}) });

          const avgChestValue = chestAvgBySize[size] ?? "";
          const chestFromRow = rowChestCol ? row.values[rowChestCol] : "";
          const chestTag = deriveChestTag(size, avgChestValue || chestFromRow);
          if (chestTag) chestSizeTagsBySize[size] = chestTag;

          const tagBySizeCol = tagColumnBySize.get(size);
          const tagBySizeRaw = tagBySizeCol ? row.values[tagBySizeCol] ?? "" : "";
          const tagBySize = tagBySizeCol ? deriveChestTag(size, avgChestValue || tagBySizeRaw) : "";
          if (tagBySize) chestSizeTagsBySize[size] = tagBySize;
        }
      }
    }

    const variants = [...variantMap.values()].sort((a, b) => a.size.localeCompare(b.size));
    if (variants.length === 0) {
      validationErrors.push("at least one size must have qty > 0");
    }
    for (const variant of variants) {
      if (!chestSizeTagsBySize[variant.size]) {
        chestSizeTagsBySize[variant.size] = fallbackChestTag(variant.size);
      }
    }

    groups.push({
      sku,
      rowIndexes: groupedRows.map((r) => r.rowIndex),
      title,
      vendor,
      productType,
      color,
      sellingPrice: Number.isFinite(sellingPrice) ? sellingPrice : 0,
      status,
      variants,
      tags: deriveTags({ brand, type: productType, color, chestBySize: chestSizeTagsBySize }),
      warnings: dedupeStrings(warnings),
      validationErrors: dedupeStrings(validationErrors),
      derivedFieldsUsed: {
        chestSizeTagsBySize,
        sizeColumnsDetected,
        qtyColumnsDetected,
        rowBasedDetected,
      },
    });
  }

  return {
    groups,
    totalRows: rows.length,
    sourceSheet: loaded.sourceSheet,
    itemVariantSheet: loaded.itemVariantSheet,
  };
}
