import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as XLSX from "xlsx";
import { normalizeOrderMappingIdentifier } from "./orderMappingMatcher.js";
import { orderMappingError } from "./orderMappingError.js";
import {
  createOrderExpenseImportRecord,
  getExistingOrderExpenseTransactionIdentities,
  getOrderExpenseImportDetails,
  getShiprocketPassbookLookupMaps,
  insertOrderExpenseTransactions,
  listRecentOrderExpenseImports,
} from "./orderExpenseRepository.js";

const execFileAsync = promisify(execFile);
const PASSBOOK_TEMP_DIR = path.join(os.tmpdir(), "order-mapping-passbook-previews");
const MAX_PASSBOOK_FILE_SIZE = 10 * 1024 * 1024;
const SUPPORTED_PASSBOOK_EXTENSIONS = new Set([".csv", ".xlsx", ".xls", ".pdf", ".tsv"]);

const HEADER_ALIASES = {
  transactionId: ["transactionid", "transactionid#", "txnid", "txn", "txnnumber", "transactionnumber", "referenceid"],
  transactionDate: ["transactiondate", "date", "createdat", "transactiontime", "dateandtime"],
  awb: ["awb", "awbno", "awbnumber", "awbcode"],
  shiprocketOrderId: ["orderid", "shiprocketorderid", "shiprocketorder"],
  shiprocketShipmentId: ["shipmentid", "shiprocketshipmentid", "shiprocketresponseid"],
  channelOrderId: ["channelorderid", "channelorder", "ordername", "shopifyordernumber"],
  description: ["description", "remarks", "narration", "note"],
  transactionType: ["transactiontype", "type", "entrytype"],
  debitAmount: ["debit", "debitamount", "charges", "expenseamount"],
  creditAmount: ["credit", "creditamount", "refundamount", "reversalamount"],
  amount: ["amount", "netamount", "value"],
  balance: ["balance", "walletbalance", "closingbalance"],
  currency: ["currency", "currencycode"],
  courier: ["courier", "couriername", "carrier"],
};

function pad2(value) {
  return String(value).padStart(2, "0");
}

function sanitizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseNumericAmount(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const normalized = String(value)
    .replace(/[₹,$]/g, "")
    .replace(/\bINR\b/gi, "")
    .replace(/,/g, "")
    .trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function parseTransactionDate(value) {
  const raw = String(value || "").trim().replace(/,/g, "");
  if (!raw) {
    return null;
  }

  const isoDateTime = raw.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\b/);
  if (isoDateTime) {
    const [, y, m, d, hh = "00", mm = "00", ss = "00"] = isoDateTime;
    return `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:${pad2(ss)}Z`;
  }

  const dmy = raw.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\b/);
  if (dmy) {
    const [, d, m, y, hh = "00", mm = "00", ss = "00"] = dmy;
    return `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:${pad2(ss)}Z`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  return null;
}

function detectDelimiter(text) {
  const sample = text.split(/\r?\n/).slice(0, 5).join("\n");
  const scores = [",", ";", "\t"].map((delimiter) => ({
    delimiter,
    count: sample.split(delimiter).length - 1,
  }));
  scores.sort((left, right) => right.count - left.count);
  return scores[0]?.count ? scores[0].delimiter : ",";
}

function parseDelimitedRows(text, delimiter) {
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
    if (char === delimiter && !quoted) {
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
    throw orderMappingError("PASSBOOK_PARSE_FAILED", "Passbook CSV is malformed.");
  }

  if (cell || rows.at(-1).length) {
    rows.at(-1).push(cell.trim());
  } else {
    rows.pop();
  }

  return rows.filter((row) => row.some((value) => String(value || "").trim() !== ""));
}

function pickHeaderIndex(headers, key) {
  const aliases = HEADER_ALIASES[key] || [];
  return headers.findIndex((header) => aliases.includes(sanitizeHeader(header)));
}

function detectHeaderMap(headers) {
  return Object.fromEntries(Object.keys(HEADER_ALIASES).map((key) => [key, pickHeaderIndex(headers, key)]));
}

function valueAt(row, index) {
  return index >= 0 ? String(row[index] ?? "").trim() : "";
}

function normalizeCurrency(value) {
  const upper = String(value || "").toUpperCase();
  if (upper.includes("INR") || upper.includes("₹")) {
    return "INR";
  }
  return "INR";
}

function inferAmounts({ debitRaw, creditRaw, amountRaw, description, transactionType }) {
  let debitAmount = parseNumericAmount(debitRaw);
  let creditAmount = parseNumericAmount(creditRaw);
  const amount = parseNumericAmount(amountRaw);
  const upper = `${description || ""} ${transactionType || ""}`.toUpperCase();

  if (debitAmount === null && creditAmount === null && amount !== null) {
    if (amount < 0 || /(CREDIT|REVERSAL|REFUND)/.test(upper)) {
      creditAmount = Math.abs(amount);
      debitAmount = 0;
    } else {
      debitAmount = Math.abs(amount);
      creditAmount = 0;
    }
  }

  debitAmount = debitAmount ?? 0;
  creditAmount = creditAmount ?? 0;
  const netAmount = Number((debitAmount - creditAmount).toFixed(2));

  return { debitAmount, creditAmount, netAmount };
}

function classifyChargeType({ description, transactionType, netAmount }) {
  const upper = `${description || ""} ${transactionType || ""}`.toUpperCase();
  if (/(REVERSAL|REFUND|CREDIT NOTE)/.test(upper)) return "REVERSAL";
  if (/(CREDIT)/.test(upper) || netAmount < 0) return "CREDIT";
  if (/(RTO)/.test(upper)) return "RTO_FREIGHT";
  if (/(COD FEE|COD CHARGE|COD COLLECTION CHARGE)/.test(upper)) return "COD_CHARGE";
  if (/(WEIGHT ADJ|WEIGHT DIFFERENCE|WEIGHT CHARGE|WEIGHT)/.test(upper)) return "WEIGHT_ADJUSTMENT";
  if (/(SURCHARGE|FUEL|HANDLING)/.test(upper)) return "SURCHARGE";
  if (/(FORWARD|FREIGHT|SHIPPING)/.test(upper)) return "FORWARD_FREIGHT";
  return "OTHER";
}

function classifySkippedRow({ description, transactionType }) {
  const upper = `${description || ""} ${transactionType || ""}`.toUpperCase();
  if (/WALLET BALANCE|BALANCE SNAPSHOT/.test(upper)) return "BALANCE_SNAPSHOT";
  if (/WALLET RECHARGE|TOP[- ]?UP|ADD MONEY|RECHARGE/.test(upper)) return "WALLET_TOP_UP";
  if (/COD REMITTANCE|COD REMIT|COD TRANSFER|COD SETTLEMENT/.test(upper)) return "COD_REMITTANCE";
  return null;
}

function buildTransactionIdentity(row) {
  const txId = normalizeOrderMappingIdentifier(row.transactionId);
  if (txId) {
    return txId;
  }
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify([
        row.transactionDate || "",
        normalizeOrderMappingIdentifier(row.awb),
        normalizeOrderMappingIdentifier(row.shiprocketOrderId),
        normalizeOrderMappingIdentifier(row.shiprocketShipmentId),
        normalizeOrderMappingIdentifier(row.channelOrderId),
        String(row.description || "").trim(),
        Number(row.debitAmount || 0).toFixed(2),
        Number(row.creditAmount || 0).toFixed(2),
      ]),
    )
    .digest("hex")
    .toUpperCase();
}

function extractPdfTableRows(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const rows = lines
    .map((line) => {
      if (line.includes("|")) {
        return line.split("|").map((part) => part.trim());
      }
      if (line.includes("\t")) {
        return line.split("\t").map((part) => part.trim());
      }
      return line.split(/\s{2,}/).map((part) => part.trim());
    })
    .filter((row) => row.length >= 3);

  return rows;
}

async function runCommand(command, args) {
  try {
    return await execFileAsync(command, args, { maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    throw orderMappingError("PDF_PARSE_FAILED", error.stderr?.trim() || error.message || `${command} failed`, {
      statusCode: 400,
    });
  }
}

async function extractPassbookPdfRows(filePath) {
  const { stdout } = await runCommand("pdftotext", ["-layout", "-nopgbrk", filePath, "-"]);
  const text = String(stdout || "").trim();
  if (text) {
    return extractPdfTableRows(text);
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "shiprocket-passbook-ocr-"));
  try {
    const outputBase = path.join(tempDir, "page");
    await runCommand("pdftoppm", ["-png", "-f", "1", "-l", "5", filePath, outputBase]);
    const pageFiles = (await fs.readdir(tempDir)).filter((entry) => entry.endsWith(".png")).sort();
    const chunks = [];
    for (const pageFile of pageFiles) {
      const { stdout: ocrText } = await runCommand("tesseract", [path.join(tempDir, pageFile), "stdout", "--psm", "6"]);
      chunks.push(String(ocrText || ""));
    }
    const ocrRows = extractPdfTableRows(chunks.join("\n"));
    if (!ocrRows.length) {
      throw orderMappingError("PDF_PARSE_FAILED", "Could not reliably extract passbook rows from PDF.", { statusCode: 400 });
    }
    return ocrRows;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function parsePassbookRows(file) {
  if (!file) {
    throw orderMappingError("UNSUPPORTED_PASSBOOK_FORMAT", "Passbook file required.");
  }
  if (file.size > MAX_PASSBOOK_FILE_SIZE) {
    throw orderMappingError("FILE_TOO_LARGE", "Passbook file exceeds maximum limit of 10MB.");
  }
  if (file.size === 0) {
    throw orderMappingError("EMPTY_PASSBOOK", "Passbook file is empty.");
  }

  const extension = path.extname(String(file.originalname || "")).toLowerCase();
  if (!SUPPORTED_PASSBOOK_EXTENSIONS.has(extension)) {
    throw orderMappingError("UNSUPPORTED_PASSBOOK_FORMAT", "Supported passbook formats are CSV, XLSX, XLS, and PDF.");
  }

  if (extension === ".csv" || extension === ".tsv") {
    const raw = await fs.readFile(file.path, "utf8");
    const text = raw.replace(/^\uFEFF/, "");
    const rows = parseDelimitedRows(text, extension === ".tsv" ? "\t" : detectDelimiter(text));
    return { format: extension.slice(1).toUpperCase(), rows };
  }

  if (extension === ".xlsx" || extension === ".xls") {
    try {
      const workbook = XLSX.read(await fs.readFile(file.path), { type: "buffer", raw: false, cellDates: false });
      const firstSheet = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheet];
      const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, defval: "" });
      return { format: extension.slice(1).toUpperCase(), rows: rows.filter((row) => row.some((value) => String(value || "").trim() !== "")) };
    } catch (error) {
      throw orderMappingError("SPREADSHEET_PARSE_FAILED", "Could not parse the spreadsheet passbook.", { cause: error });
    }
  }

  return { format: "PDF", rows: await extractPassbookPdfRows(file.path) };
}

function normalizePassbookRows(rows) {
  if (!rows.length) {
    throw orderMappingError("EMPTY_PASSBOOK", "Passbook file is empty.");
  }

  const [headerRow, ...dataRows] = rows;
  const headers = headerRow.map((value) => String(value || "").trim());
  const mapping = detectHeaderMap(headers);
  if (
    mapping.transactionDate < 0
    || (mapping.description < 0 && mapping.transactionType < 0)
    || (mapping.debitAmount < 0 && mapping.creditAmount < 0 && mapping.amount < 0)
  ) {
    throw orderMappingError("MISSING_HEADER", "Passbook file is missing required transaction headers.", {
      details: { headers },
    });
  }

  const normalizedRows = [];
  for (const [index, row] of dataRows.entries()) {
    const description = valueAt(row, mapping.description);
    const transactionType = valueAt(row, mapping.transactionType);
    const skippedType = classifySkippedRow({ description, transactionType });
    const amounts = inferAmounts({
      debitRaw: valueAt(row, mapping.debitAmount),
      creditRaw: valueAt(row, mapping.creditAmount),
      amountRaw: valueAt(row, mapping.amount),
      description,
      transactionType,
    });
    const transactionDate = parseTransactionDate(valueAt(row, mapping.transactionDate));

    const normalized = {
      sourceRowNumber: index + 2,
      transactionId: valueAt(row, mapping.transactionId),
      transactionDate,
      awb: valueAt(row, mapping.awb),
      shiprocketOrderId: valueAt(row, mapping.shiprocketOrderId),
      shiprocketShipmentId: valueAt(row, mapping.shiprocketShipmentId),
      channelOrderId: valueAt(row, mapping.channelOrderId),
      description,
      transactionType,
      debitAmount: amounts.debitAmount,
      creditAmount: amounts.creditAmount,
      netAmount: amounts.netAmount,
      currency: normalizeCurrency(valueAt(row, mapping.currency)),
      courier: valueAt(row, mapping.courier),
      skippedType,
      chargeType: classifyChargeType({ description, transactionType, netAmount: amounts.netAmount }),
    };

    if (!normalized.transactionDate) {
      throw orderMappingError("INVALID_DATE", "Passbook row contains an invalid date.", {
        details: { rowNumber: normalized.sourceRowNumber },
      });
    }

    if (normalized.skippedType) {
      normalizedRows.push(normalized);
      continue;
    }

    if (!Number.isFinite(normalized.netAmount)) {
      throw orderMappingError("INVALID_AMOUNT", "Passbook row contains an invalid amount.", {
        details: { rowNumber: normalized.sourceRowNumber },
      });
    }

    normalized.transactionIdentity = buildTransactionIdentity(normalized);
    normalizedRows.push(normalized);
  }

  return { headers, rows: normalizedRows };
}

function chooseCandidate(row, lookupMaps) {
  const candidates = [];

  for (const [value, mapKey, method] of [
    [row.awb, "awb", "AWB"],
    [row.shiprocketShipmentId, "shiprocketShipmentId", "SHIPMENT_ID"],
    [row.shiprocketOrderId, "shiprocketOrderId", "SHIPROCKET_ORDER_ID"],
    [row.channelOrderId, "channelOrderId", "CHANNEL_ORDER_ID"],
  ]) {
    const normalized = normalizeOrderMappingIdentifier(value);
    if (!normalized) {
      continue;
    }
    for (const candidate of lookupMaps.shipments[mapKey].get(normalized) || []) {
      candidates.push({ ...candidate, matchMethod: method, matchedValue: value });
    }
  }

  const normalizedOrderNumber = normalizeOrderMappingIdentifier(row.channelOrderId);
  if (normalizedOrderNumber) {
    for (const candidate of lookupMaps.shopifyOrders.get(normalizedOrderNumber) || []) {
      candidates.push({ ...candidate, matchMethod: "SHOPIFY_ORDER_NUMBER", matchedValue: row.channelOrderId });
    }
  }

  const uniqueOrderIds = [...new Set(candidates.map((candidate) => candidate.orderId).filter(Boolean))];
  if (!uniqueOrderIds.length) {
    return { matchStatus: "UNMATCHED", matchMethod: null, matchedValue: null, matchedOrderId: null, matchedShipmentId: null, shopifyOrderId: null, shopifyOrderNumber: null, courier: row.courier || null };
  }
  if (uniqueOrderIds.length > 1) {
    return { matchStatus: "CONFLICT", matchMethod: null, matchedValue: null, matchedOrderId: null, matchedShipmentId: null, shopifyOrderId: null, shopifyOrderNumber: null, courier: row.courier || null };
  }

  const preferred = candidates.find((candidate) => candidate.matchMethod === "AWB")
    || candidates.find((candidate) => candidate.matchMethod === "SHIPMENT_ID")
    || candidates[0];
  return {
    matchStatus: "MATCHED",
    matchMethod: preferred.matchMethod,
    matchedValue: preferred.matchedValue,
    matchedOrderId: preferred.orderId,
    matchedShipmentId: preferred.shipmentId,
    shopifyOrderId: preferred.shopifyOrderId,
    shopifyOrderNumber: preferred.shopifyOrderNumber,
    courier: row.courier || preferred.courier || null,
  };
}

function summarizePreview(file, previewRows) {
  const financialRows = previewRows.filter((row) => !row.skippedType);
  const matchedRows = financialRows.filter((row) => row.matchStatus === "MATCHED" && !row.duplicate);
  const unmatchedRows = financialRows.filter((row) => row.matchStatus === "UNMATCHED" && !row.duplicate);
  const conflictRows = financialRows.filter((row) => row.matchStatus === "CONFLICT" && !row.duplicate);
  const duplicateRows = financialRows.filter((row) => row.duplicate);
  const grossDebits = Number(financialRows.reduce((sum, row) => sum + Number(row.debitAmount || 0), 0).toFixed(2));
  const grossCredits = Number(financialRows.reduce((sum, row) => sum + Number(row.creditAmount || 0), 0).toFixed(2));
  const netCharges = Number(financialRows.reduce((sum, row) => sum + Number(row.netAmount || 0), 0).toFixed(2));

  return {
    provider: "SHIPROCKET",
    fileName: file.originalname,
    fileHash: file.fileHash,
    parsedRows: previewRows.length,
    financialRows: financialRows.length,
    matched: matchedRows.length,
    unmatched: unmatchedRows.length,
    conflicts: conflictRows.length,
    duplicates: duplicateRows.length,
    grossDebits,
    grossCredits,
    netCharges,
    rows: previewRows,
  };
}

async function ensurePreviewDir() {
  await fs.mkdir(PASSBOOK_TEMP_DIR, { recursive: true });
}

function previewMetadataPath(importId) {
  return path.join(PASSBOOK_TEMP_DIR, `${importId}.json`);
}

async function writePreviewMetadata(importId, payload) {
  await ensurePreviewDir();
  await fs.writeFile(previewMetadataPath(importId), JSON.stringify(payload), "utf8");
}

async function readPreviewMetadata(importId) {
  return JSON.parse(await fs.readFile(previewMetadataPath(importId), "utf8"));
}

export async function cleanupOrderExpenseImportPreviews(maxAgeMs = 6 * 60 * 60 * 1000) {
  await ensurePreviewDir();
  const cutoff = Date.now() - maxAgeMs;
  for (const entry of await fs.readdir(PASSBOOK_TEMP_DIR)) {
    const filePath = path.join(PASSBOOK_TEMP_DIR, entry);
    const stat = await fs.stat(filePath).catch(() => null);
    if (stat && stat.mtimeMs < cutoff) {
      await fs.unlink(filePath).catch(() => {});
    }
  }
}

export async function previewShiprocketPassbookImport(file) {
  await cleanupOrderExpenseImportPreviews();
  try {
    const fileBuffer = await fs.readFile(file.path);
    const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    const parsed = await parsePassbookRows(file);
    const normalized = normalizePassbookRows(parsed.rows);
    const financialRows = normalized.rows.filter((row) => !row.skippedType);
    const lookupMaps = await getShiprocketPassbookLookupMaps({
      awbs: financialRows.map((row) => row.awb),
      shiprocketShipmentIds: financialRows.map((row) => row.shiprocketShipmentId),
      shiprocketOrderIds: financialRows.map((row) => row.shiprocketOrderId),
      channelOrderIds: financialRows.map((row) => row.channelOrderId),
      shopifyOrderNumbers: financialRows.map((row) => row.channelOrderId),
    });
    const existingIdentities = await getExistingOrderExpenseTransactionIdentities("SHIPROCKET", financialRows.map((row) => row.transactionIdentity));

    const previewRows = normalized.rows.map((row) => {
      if (row.skippedType) {
        return {
          ...row,
          provider: "SHIPROCKET",
          duplicate: false,
          matchStatus: "SKIPPED",
          matchMethod: null,
          matchedValue: null,
          matchedOrderId: null,
          matchedShipmentId: null,
          shopifyOrderId: null,
          shopifyOrderNumber: null,
        };
      }
      const match = chooseCandidate(row, lookupMaps);
      return {
        ...row,
        provider: "SHIPROCKET",
        ...match,
        duplicate: existingIdentities.has(row.transactionIdentity),
        sourceFileHash: fileHash,
        sourceFileName: file.originalname,
        sourceReference: row.transactionId || row.transactionIdentity,
      };
    });

    const preview = summarizePreview({ originalname: file.originalname, fileHash }, previewRows);
    const importId = crypto.randomUUID();
    const payload = {
      importId,
      provider: "SHIPROCKET",
      sourceFileName: file.originalname,
      sourceFileHash: fileHash,
      format: parsed.format,
      headers: normalized.headers,
      preview,
    };
    await writePreviewMetadata(importId, payload);

    return {
      importId,
      fileName: file.originalname,
      fileHash,
      format: parsed.format,
      headers: normalized.headers,
      ...preview,
    };
  } finally {
    await fs.unlink(file.path).catch(() => {});
  }
}

export async function confirmShiprocketPassbookImport(importId) {
  const metadata = await readPreviewMetadata(importId);
  const previewRows = metadata.preview.rows || [];
  const financialRows = previewRows.filter((row) => !row.skippedType);
  const existingIdentities = await getExistingOrderExpenseTransactionIdentities("SHIPROCKET", financialRows.map((row) => row.transactionIdentity));

  const rowsToInsert = financialRows
    .filter((row) => !existingIdentities.has(row.transactionIdentity))
    .map((row) => ({
      provider: "SHIPROCKET",
      matchedOrderId: row.matchedOrderId,
      matchedShipmentId: row.matchedShipmentId,
      shopifyOrderId: row.shopifyOrderId,
      shopifyOrderNumber: row.shopifyOrderNumber,
      shiprocketOrderId: row.shiprocketOrderId,
      shiprocketShipmentId: row.shiprocketShipmentId,
      channelOrderId: row.channelOrderId,
      awb: row.awb,
      transactionId: row.transactionId,
      transactionIdentity: row.transactionIdentity,
      transactionDate: row.transactionDate,
      chargeType: row.chargeType,
      description: row.description,
      transactionType: row.transactionType,
      debitAmount: row.debitAmount,
      creditAmount: row.creditAmount,
      netAmount: row.netAmount,
      currency: row.currency || "INR",
      courier: row.courier,
      sourceFileHash: metadata.sourceFileHash,
      sourceFileName: metadata.sourceFileName,
      sourceRowNumber: row.sourceRowNumber,
      sourceReference: row.sourceReference,
      matchStatus: row.matchStatus,
      matchMethod: row.matchMethod,
      matchedValue: row.matchedValue,
    }));

  const importRecord = await createOrderExpenseImportRecord({
    provider: "SHIPROCKET",
    sourceFileName: metadata.sourceFileName,
    sourceFileHash: metadata.sourceFileHash,
    rowCount: metadata.preview.parsedRows,
    financialRowCount: metadata.preview.financialRows,
    matchedCount: metadata.preview.matched,
    unmatchedCount: metadata.preview.unmatched,
    conflictCount: metadata.preview.conflicts,
    duplicateCount: financialRows.length - rowsToInsert.length,
    grossDebits: metadata.preview.grossDebits,
    grossCredits: metadata.preview.grossCredits,
    netAmount: metadata.preview.netCharges,
    status: rowsToInsert.length ? "confirmed" : "duplicate_only",
  });

  await insertOrderExpenseTransactions(importRecord.id, rowsToInsert);
  await fs.unlink(previewMetadataPath(importId)).catch(() => {});

  return {
    importId: importRecord.id,
    insertedTransactions: rowsToInsert.length,
    duplicateTransactions: financialRows.length - rowsToInsert.length,
    summary: metadata.preview,
  };
}

export async function listShiprocketPassbookImports(limit = 10) {
  return listRecentOrderExpenseImports(limit);
}

export async function getShiprocketPassbookImportDetails(importId) {
  return getOrderExpenseImportDetails(importId);
}
