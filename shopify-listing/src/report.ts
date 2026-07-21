import { createWriteStream, WriteStream } from "node:fs";
import { join } from "node:path";
import { ensureDir, nowIso } from "./utils";

export interface SkuLogEntry {
  runId: string;
  sku: string;
  source: {
    type: "csv";
    path: string;
  };
  rowIndexes: number[];
  created: boolean;
  productGid: string | null;
  title: string;
  vendor: string;
  productType: string;
  color: string;
  status: "DRAFT" | "ACTIVE";
  optionsCreated: ["Size"];
  propertiesAdded: {
    tagsAdded: string[];
    variantsCreated: Array<{
      size: string;
      variantSku: string;
      variantGid: string;
      price: number;
      qtySet: number;
    }>;
    inventoryActions: Array<{
      size: string;
      inventoryItemGid: string;
      locationGid: string;
      finalQty: number;
      method: "set" | "adjust";
      delta: number;
    }>;
    derivedFieldsUsed: {
      chestSizeTagsBySize: Record<string, string>;
      sizeColumnsDetected: string[];
      qtyColumnsDetected: string[];
      rowBasedDetected: boolean;
    };
  };
  warnings: string[];
  errors: string[];
  metrics: {
    variantsPlanned: number;
    variantsCreated: number;
    inventorySetCount: number;
    throttleRetries: number;
    shopifyCalls: number;
    executionTimeMs: number;
  };
  summary: {
    status: "SUCCESS" | "FAILED" | "SKIPPED" | "DRY_RUN";
    reason?: string;
  };
}

export interface RunSummaryInput {
  runId: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  csvPath: string;
  entries: SkuLogEntry[];
}

const CSV_COLUMNS = [
  "runId",
  "sku",
  "sourceType",
  "sourcePath",
  "rowIndexes",
  "created",
  "productGid",
  "title",
  "vendor",
  "productType",
  "color",
  "status",
  "optionsCreated",
  "tagsAdded",
  "variantsCreated",
  "inventoryActions",
  "derivedFieldsUsed",
  "warnings",
  "errors",
  "metrics",
  "summaryStatus",
  "summaryReason",
  "summaryJson",
] as const;

function csvEscape(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : String(value)
          .replace(/\r\n/g, " ")
          .replace(/\n/g, " ")
          .replace(/\r/g, " ");
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsvRow(values: unknown[]): string {
  return `${values.map(csvEscape).join(",")}\n`;
}

function flatList(values: string[]): string {
  return values
    .map((v) => String(v ?? "").trim())
    .filter(Boolean)
    .join(" | ");
}

function flatObject(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${String(v ?? "").trim()}`)
    .join(" | ");
}

export class CsvReporter {
  private readonly stream: WriteStream;
  private readonly filePath: string;

  constructor(logDir: string, runId: string, logPrefix?: string) {
    ensureDir(logDir);
    const normalizedPrefix = String(logPrefix ?? "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "_");
    const filename = normalizedPrefix ? `${normalizedPrefix}_run_log_${runId}.csv` : `run_log_${runId}.csv`;
    this.filePath = join(logDir, filename);
    this.stream = createWriteStream(this.filePath, { flags: "a" });
    this.stream.write(toCsvRow([...CSV_COLUMNS]));
  }

  get path(): string {
    return this.filePath;
  }

  writeEntry(entry: SkuLogEntry): void {
    const variantsCreated = entry.propertiesAdded.variantsCreated.map(
      (v) => `${v.size}:${v.variantSku}:${v.price}:${v.qtySet}`
    );
    const inventoryActions = entry.propertiesAdded.inventoryActions.map(
      (a) => `${a.size}:${a.method}:${a.finalQty}:${a.delta}`
    );
    const derivedFieldsUsed = [
      `rowBasedDetected=${entry.propertiesAdded.derivedFieldsUsed.rowBasedDetected}`,
      `sizeColumnsDetected=${entry.propertiesAdded.derivedFieldsUsed.sizeColumnsDetected.join("|")}`,
      `qtyColumnsDetected=${entry.propertiesAdded.derivedFieldsUsed.qtyColumnsDetected.join("|")}`,
      `chestSizeTagsBySize=${flatObject(entry.propertiesAdded.derivedFieldsUsed.chestSizeTagsBySize)}`,
    ].join(" | ");
    const metrics = [
      `variantsPlanned=${entry.metrics.variantsPlanned}`,
      `variantsCreated=${entry.metrics.variantsCreated}`,
      `inventorySetCount=${entry.metrics.inventorySetCount}`,
      `throttleRetries=${entry.metrics.throttleRetries}`,
      `shopifyCalls=${entry.metrics.shopifyCalls}`,
      `executionTimeMs=${entry.metrics.executionTimeMs}`,
    ].join(" | ");

    const row = [
      entry.runId,
      entry.sku,
      entry.source.type,
      entry.source.path,
      entry.rowIndexes.join(" | "),
      entry.created,
      entry.productGid ?? "",
      entry.title,
      entry.vendor,
      entry.productType,
      entry.color,
      entry.status,
      flatList(entry.optionsCreated),
      flatList(entry.propertiesAdded.tagsAdded),
      flatList(variantsCreated),
      flatList(inventoryActions),
      derivedFieldsUsed,
      flatList(entry.warnings),
      flatList(entry.errors),
      metrics,
      entry.summary.status,
      entry.summary.reason ?? "",
      "",
    ];
    this.stream.write(toCsvRow(row));
  }

  finalizeSummary(input: RunSummaryInput): void {
    const counts = {
      skuGroupsTotal: input.entries.length,
      attempted: input.entries.filter((e) => e.summary.status === "SUCCESS" || e.summary.status === "FAILED").length,
      created: input.entries.filter((e) => e.summary.status === "SUCCESS").length,
      failed: input.entries.filter((e) => e.summary.status === "FAILED").length,
      skipped: input.entries.filter((e) => e.summary.status === "SKIPPED" || e.summary.status === "DRY_RUN").length,
    };

    const errorCounter = new Map<string, number>();
    const warningCounter = new Map<string, number>();

    for (const entry of input.entries) {
      for (const err of entry.errors) {
        errorCounter.set(err, (errorCounter.get(err) ?? 0) + 1);
      }
      for (const wrn of entry.warnings) {
        warningCounter.set(wrn, (warningCounter.get(wrn) ?? 0) + 1);
      }
    }

    const topErrors = [...errorCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    const topWarnings = [...warningCounter.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count }));

    const summary = {
      type: "RUN_SUMMARY",
      runId: input.runId,
      startedAt: input.startedAt,
      finishedAt: input.finishedAt,
      durationMs: input.durationMs,
      input: { source: "csv", path: input.csvPath },
      counts,
      topErrors,
      topWarnings,
    };
    const summaryFlat = [
      "type=RUN_SUMMARY",
      `runId=${summary.runId}`,
      `startedAt=${summary.startedAt}`,
      `finishedAt=${summary.finishedAt}`,
      `durationMs=${summary.durationMs}`,
      `skuGroupsTotal=${summary.counts.skuGroupsTotal}`,
      `attempted=${summary.counts.attempted}`,
      `created=${summary.counts.created}`,
      `failed=${summary.counts.failed}`,
      `skipped=${summary.counts.skipped}`,
    ].join(" | ");

    const summaryRow = [
      input.runId,
      "RUN_SUMMARY",
      "csv",
      input.csvPath,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "RUN_SUMMARY",
      "",
      summaryFlat,
    ];
    this.stream.write(toCsvRow(summaryRow));
    this.stream.end();
  }
}

export function createRunId(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}${ss}`;
}
