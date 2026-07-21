import { normalizeIdentifier } from "./orderMatcher.js";

const ALIASES = {
  orderNumber: ["order number", "order id", "channel order id", "order"],
  awb: ["awb", "awb number", "tracking number", "tracking"],
  status: ["courier status", "delivery status", "status", "shipment status"],
  deliveredAt: ["delivered date", "delivery date", "delivered at"],
};

function parse(text) {
  const rows = [[]]; let cell = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += char; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { rows.at(-1).push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      rows.at(-1).push(cell.trim()); rows.push([]); cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("Malformed CSV: unmatched quote");
  if (cell || rows.at(-1).length) rows.at(-1).push(cell.trim()); else rows.pop();
  return rows.filter((row) => row.some(Boolean));
}

function columnMap(headers, supplied = {}) {
  const normalized = headers.map((value) => value.trim().toLowerCase());
  return Object.fromEntries(Object.entries(ALIASES).map(([key, aliases]) => {
    const chosen = supplied[key];
    const index = chosen ? headers.indexOf(chosen) : normalized.findIndex((header) => aliases.includes(header));
    return [key, index];
  }));
}

export function csvColumns(text) { return parse(text)[0] || []; }

export function parseLegacyCsv(text, suppliedMapping = {}) {
  if (!text.trim()) throw new Error("CSV is empty");
  const [headers, ...data] = parse(text);
  const map = columnMap(headers, suppliedMapping);
  if (map.status < 0 || (map.orderNumber < 0 && map.awb < 0)) throw new Error("CSV is missing required reconciliation columns");
  const seen = new Set();
  const rows = data.map((values) => ({
    orderNumber: map.orderNumber < 0 ? "" : values[map.orderNumber] || "",
    awb: map.awb < 0 ? "" : values[map.awb] || "",
    status: values[map.status] || "",
    deliveredAt: map.deliveredAt < 0 ? "" : values[map.deliveredAt] || "",
  })).filter((row) => {
    const key = `${normalizeIdentifier(row.orderNumber)}|${normalizeIdentifier(row.awb)}|${row.status}|${row.deliveredAt}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  return { headers, map, rows };
}
