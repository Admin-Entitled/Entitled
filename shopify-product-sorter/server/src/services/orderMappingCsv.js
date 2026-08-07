import crypto from "node:crypto";
import { orderMappingError } from "./orderMappingError.js";
import { normalizeOrderMappingIdentifier } from "./orderMappingMatcher.js";
import { normalizeOrderMappingStatus } from "./orderMappingStatus.js";

const COLUMN_ALIASES = {
  shopifyOrderId: ["shopify order id", "order id", "shopify id"],
  orderNumber: ["order number", "order name", "channel order id", "order"],
  awb: ["awb", "awb number", "tracking number", "tracking"],
  courier: ["courier", "courier partner", "carrier"],
  status: ["courier status", "delivery status", "shipment status", "status"],
  statusDate: ["status date", "updated at", "event date", "shipment date"],
  deliveredAt: ["delivered date", "delivery date", "delivered at"],
  remarks: ["remarks", "notes", "reason"],
};

function parseCsv(text) {
  const rows = [[]];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') {
      cell += char;
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      rows.at(-1).push(cell.trim());
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      rows.at(-1).push(cell.trim());
      rows.push([]);
      cell = "";
      continue;
    }
    cell += char;
  }

  if (quoted) {
    throw orderMappingError(
      "ORDER_MAPPING_CSV_MALFORMED",
      "CSV is malformed",
    );
  }

  if (cell || rows.at(-1).length) {
    rows.at(-1).push(cell.trim());
  } else {
    rows.pop();
  }

  return rows.filter((row) => row.some(Boolean));
}

function detectMap(headers, supplied = {}) {
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  return Object.fromEntries(
    Object.entries(COLUMN_ALIASES).map(([key, aliases]) => {
      const chosen = supplied[key];
      const index = chosen ? headers.indexOf(chosen) : normalizedHeaders.findIndex((header) => aliases.includes(header));
      return [key, index];
    }),
  );
}

function parseTimestamp(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function orderMappingCsvColumns(text) {
  return parseCsv(text)[0] || [];
}

export function parseOrderMappingCsv(text, mapping = {}) {
  if (!text.trim()) {
    throw orderMappingError("ORDER_MAPPING_CSV_EMPTY", "CSV is empty");
  }

  const [headers, ...rows] = parseCsv(text);
  const detectedMap = detectMap(headers, mapping);

  if (detectedMap.status < 0 || (detectedMap.shopifyOrderId < 0 && detectedMap.orderNumber < 0 && detectedMap.awb < 0)) {
    throw orderMappingError(
      "ORDER_MAPPING_CSV_REQUIRED_COLUMNS",
      "CSV is missing required Order Mapping columns",
    );
  }

  const seenRowHashes = new Set();
  const normalizedRows = rows.map((values, index) => {
    const row = {
      rowNumber: index + 2,
      shopifyOrderId: detectedMap.shopifyOrderId < 0 ? "" : values[detectedMap.shopifyOrderId] || "",
      orderNumber: detectedMap.orderNumber < 0 ? "" : values[detectedMap.orderNumber] || "",
      awb: detectedMap.awb < 0 ? "" : values[detectedMap.awb] || "",
      courier: detectedMap.courier < 0 ? "" : values[detectedMap.courier] || "",
      rawStatus: detectedMap.status < 0 ? "" : values[detectedMap.status] || "",
      statusTimestamp: detectedMap.statusDate < 0 ? null : parseTimestamp(values[detectedMap.statusDate] || ""),
      deliveredAt: detectedMap.deliveredAt < 0 ? null : parseTimestamp(values[detectedMap.deliveredAt] || ""),
      remarks: detectedMap.remarks < 0 ? "" : values[detectedMap.remarks] || "",
    };

    if (!row.rawStatus) {
      throw orderMappingError(
        "ORDER_MAPPING_CSV_MISSING_FIELD",
        "CSV row is missing a required field",
        { details: { rowNumber: row.rowNumber, field: "status" } },
      );
    }

    row.normalizedStatus = normalizeOrderMappingStatus(row.rawStatus, null);
    if (!row.normalizedStatus) {
      throw orderMappingError(
        "ORDER_MAPPING_INVALID_STATUS",
        "CSV row contains an invalid status",
        { details: { rowNumber: row.rowNumber } },
      );
    }
    row.rowHash = crypto
      .createHash("sha256")
      .update(
        JSON.stringify([
          normalizeOrderMappingIdentifier(row.shopifyOrderId),
          normalizeOrderMappingIdentifier(row.orderNumber),
          normalizeOrderMappingIdentifier(row.awb),
          row.rawStatus,
          row.statusTimestamp,
          row.deliveredAt,
        ]),
      )
      .digest("hex");

    if (seenRowHashes.has(row.rowHash)) {
      throw orderMappingError(
        "ORDER_MAPPING_CSV_DUPLICATE_ROW",
        "CSV contains a duplicate or conflicting row",
        { statusCode: 409, details: { rowNumber: row.rowNumber } },
      );
    }
    seenRowHashes.add(row.rowHash);

    return row;
  });

  return { headers, mapping: detectedMap, rows: normalizedRows };
}
