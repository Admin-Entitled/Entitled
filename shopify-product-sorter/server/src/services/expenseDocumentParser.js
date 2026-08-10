import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppError } from "../middleware/errorBoundary.js";

const execFileAsync = promisify(execFile);
const SUPPORTED_PROVIDERS = ["META", "SHIPROCKET", "SHOPIFY"];
const MONTH_NAMES = {
  JANUARY: 1,
  JAN: 1,
  FEBRUARY: 2,
  FEB: 2,
  MARCH: 3,
  MAR: 3,
  APRIL: 4,
  APR: 4,
  MAY: 5,
  JUNE: 6,
  JUN: 6,
  JULY: 7,
  JUL: 7,
  AUGUST: 8,
  AUG: 8,
  SEPTEMBER: 9,
  SEP: 9,
  SEPT: 9,
  OCTOBER: 10,
  OCT: 10,
  NOVEMBER: 11,
  NOV: 11,
  DECEMBER: 12,
  DEC: 12,
};

function cleanText(value) {
  return String(value || "")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeCurrency(raw) {
  const value = String(raw || "").toUpperCase();
  if (!value) {
    return null;
  }
  if (value.includes("INR") || value.includes("₹")) return "INR";
  if (value.includes("USD") || value.includes("$")) return "USD";
  if (value.includes("EUR") || value.includes("€")) return "EUR";
  if (value.includes("GBP") || value.includes("£")) return "GBP";
  return null;
}

function monthToValue(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function padDateSegment(value) {
  return String(value).padStart(2, "0");
}

function formatIsoDate(year, month, day) {
  return `${year}-${padDateSegment(month)}-${padDateSegment(day)}`;
}

function parseNumericAmount(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value)
    .replace(/[₹,$€£]/g, "")
    .replace(/\bINR\b/gi, "")
    .replace(/\bUSD\b/gi, "")
    .replace(/\bEUR\b/gi, "")
    .replace(/\bGBP\b/gi, "")
    .replace(/,/g, "")
    .trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function parseDateValue(raw) {
  const value = String(raw || "").trim().replace(/,/g, "");
  if (!value) {
    return null;
  }

  const isoMatch = value.match(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) {
    return formatIsoDate(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
  }

  const dmyMatch = value.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/);
  if (dmyMatch) {
    return formatIsoDate(Number(dmyMatch[3]), Number(dmyMatch[2]), Number(dmyMatch[1]));
  }

  const monthNameMatch = value.match(/\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b/);
  if (monthNameMatch) {
    const month = MONTH_NAMES[monthNameMatch[2].toUpperCase()];
    if (month) {
      return formatIsoDate(Number(monthNameMatch[3]), month, Number(monthNameMatch[1]));
    }
  }

  const altMonthNameMatch = value.match(/\b([A-Za-z]+)\s+(\d{1,2})\s+(\d{4})\b/);
  if (altMonthNameMatch) {
    const month = MONTH_NAMES[altMonthNameMatch[1].toUpperCase()];
    if (month) {
      return formatIsoDate(Number(altMonthNameMatch[3]), month, Number(altMonthNameMatch[2]));
    }
  }

  return null;
}

function parseMonthValue(raw) {
  const value = String(raw || "").trim().replace(/,/g, "");
  if (!value) {
    return null;
  }

  const explicitMatch = value.match(/\b(\d{4})-(\d{2})\b/);
  if (explicitMatch) {
    return `${explicitMatch[1]}-${explicitMatch[2]}`;
  }

  const monthNameMatch = value.match(/\b([A-Za-z]+)\s+(\d{4})\b/);
  if (monthNameMatch) {
    const month = MONTH_NAMES[monthNameMatch[1].toUpperCase()];
    if (month) {
      return monthToValue(Number(monthNameMatch[2]), month);
    }
  }

  const monthNameSlashMatch = value.match(/\b([A-Za-z]+)\s*[-/]\s*([A-Za-z]+)?\s*(\d{4})\b/);
  if (monthNameSlashMatch) {
    const month = MONTH_NAMES[monthNameSlashMatch[1].toUpperCase()];
    if (month) {
      return monthToValue(Number(monthNameSlashMatch[3]), month);
    }
  }

  return null;
}

function detectProviderFromText(text, preferredProvider = null) {
  const upper = text.toUpperCase();
  const matches = [];
  if (/(META ADS|META PLATFORMS|FACEBOOK)/.test(upper)) {
    matches.push("META");
  }
  if (/(SHIPROCKET|BIGFOOT RETAIL)/.test(upper)) {
    matches.push("SHIPROCKET");
  }
  if (/(SHOPIFY|SHOPIFY INTERNATIONAL)/.test(upper)) {
    matches.push("SHOPIFY");
  }

  if (matches.length === 1) {
    return { value: matches[0], confidence: "HIGH" };
  }
  if (matches.length > 1) {
    return { value: "NEEDS_REVIEW", confidence: "LOW" };
  }
  if (preferredProvider && SUPPORTED_PROVIDERS.includes(preferredProvider)) {
    return { value: preferredProvider, confidence: "LOW" };
  }
  return { value: "NEEDS_REVIEW", confidence: "MISSING" };
}

function extractLabelValue(text, labelPatterns) {
  for (const pattern of labelPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }
  return null;
}

function buildField(value, confidence, warnings = []) {
  return { value, confidence, warnings };
}

function inferBillingMonth({ periodText, invoiceDate, selectedMonth }) {
  const explicitMonth = parseMonthValue(periodText);
  if (explicitMonth) {
    return buildField(explicitMonth, "HIGH");
  }

  const explicitRange = String(periodText || "").match(/(\d{1,2}[-/][\dA-Za-z]{1,10}[-/ ]\d{2,4}).{0,10}(\d{1,2}[-/][\dA-Za-z]{1,10}[-/ ]\d{2,4})/i);
  if (explicitRange) {
    const startDate = parseDateValue(explicitRange[1]);
    if (startDate) {
      return buildField(startDate.slice(0, 7), "HIGH");
    }
  }

  if (invoiceDate?.value) {
    return buildField(invoiceDate.value.slice(0, 7), "MEDIUM");
  }

  if (selectedMonth) {
    return buildField(selectedMonth, "LOW", ["Billing month fell back to the selected Expenses month."]);
  }

  return buildField("", "MISSING", ["Billing month could not be determined."]);
}

function extractTotals(text) {
  const subtotalRaw = extractLabelValue(text, [
    /(?:subtotal|taxable value)\s*[:\-]?\s*([₹$€£A-Z0-9,.\s]+)/i,
  ]);
  const igstRaw = extractLabelValue(text, [
    /(?:igst)\s*[:\-]?\s*([₹$€£A-Z0-9,.\s]+)/i,
  ]);
  const cgstRaw = extractLabelValue(text, [
    /(?:cgst)\s*[:\-]?\s*([₹$€£A-Z0-9,.\s]+)/i,
  ]);
  const sgstRaw = extractLabelValue(text, [
    /(?:sgst)\s*[:\-]?\s*([₹$€£A-Z0-9,.\s]+)/i,
  ]);
  const totalTaxRaw = extractLabelValue(text, [
    /(?:tax amount|tax total|total tax|gst amount)\s*[:\-]?\s*([₹$€£A-Z0-9,.\s]+)/i,
  ]);
  const totalRaw = extractLabelValue(text, [
    /(?:invoice total|grand total|amount due|total amount|total due|net amount payable|amount payable)\s*[:\-]?\s*([₹$€£A-Z0-9,.\s]+)/i,
    /(?:^|\n)\s*total\s*[:\-]?\s*([₹$€£A-Z0-9,.\s]+)/i,
  ]);

  const subtotal = parseNumericAmount(subtotalRaw);
  const igst = parseNumericAmount(igstRaw);
  const cgst = parseNumericAmount(cgstRaw);
  const sgst = parseNumericAmount(sgstRaw);
  const totalTax = parseNumericAmount(totalTaxRaw);
  const total = parseNumericAmount(totalRaw);

  let tax = totalTax;
  if (tax === null && (igst !== null || cgst !== null || sgst !== null)) {
    tax = Number(((igst || 0) + (cgst || 0) + (sgst || 0)).toFixed(2));
  }

  return {
    subtotal: subtotal !== null ? buildField(subtotal, "HIGH") : buildField(null, "MISSING"),
    tax: tax !== null ? buildField(tax, "HIGH") : buildField(null, "MISSING"),
    total: total !== null ? buildField(total, "HIGH") : buildField(null, "MISSING", ["Invoice total could not be confidently extracted."]),
  };
}

function detectCurrency(text, totalRaw = "") {
  const combined = `${totalRaw}\n${text}`.slice(0, 4000);
  const currency = normalizeCurrency(combined);
  if (currency) {
    return buildField(currency, "HIGH");
  }
  return buildField("", "MISSING", ["Currency could not be confidently determined."]);
}

function extractInvoiceNumber(text) {
  const invoiceNumber = extractLabelValue(text, [
    /(?:invoice number|invoice no\.?|invoice #|bill number|bill no\.?|tax invoice no\.?)\s*[:\-]?\s*([A-Z0-9\-\/]+)/i,
  ]);
  if (invoiceNumber) {
    return buildField(invoiceNumber, "HIGH");
  }
  return buildField("", "MISSING", ["Invoice number could not be found."]);
}

function extractInvoiceDate(text) {
  const raw = extractLabelValue(text, [
    /(?:invoice date|date of issue|issued on|bill date|date)\s*[:\-]?\s*([A-Za-z0-9,\-/ ]{6,40})/i,
  ]);
  const parsed = parseDateValue(raw);
  if (parsed) {
    return buildField(parsed, "HIGH");
  }
  return buildField("", "MISSING", ["Invoice date could not be found."]);
}

function extractBillingPeriodText(text) {
  return extractLabelValue(text, [
    /(?:billing period|service period|billing cycle|statement period|period)\s*[:\-]?\s*([A-Za-z0-9,\-/ ]{6,80})/i,
  ]);
}

function summarizeWarnings(fields, extractionSource) {
  const warnings = [];
  for (const [field, info] of Object.entries(fields)) {
    if (!info?.warnings?.length) {
      continue;
    }
    warnings.push(...info.warnings.map((warning) => `${field}: ${warning}`));
  }
  if (extractionSource === "OCR") {
    warnings.push("OCR was required. Please review extracted values carefully.");
  }
  return warnings;
}

async function runCommand(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      maxBuffer: 20 * 1024 * 1024,
      ...options,
    });
  } catch (error) {
    throw new AppError("DOCUMENT_EXTRACTION_FAILED", error.stderr?.trim() || error.message || `${command} failed`, {
      statusCode: 400,
    });
  }
}

async function extractPdfText(filePath) {
  const { stdout } = await runCommand("pdftotext", ["-layout", "-nopgbrk", filePath, "-"]);
  return cleanText(stdout);
}

async function ocrImage(filePath) {
  const { stdout } = await runCommand("tesseract", [filePath, "stdout", "--psm", "6"]);
  return cleanText(stdout);
}

async function ocrPdf(filePath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "expense-import-ocr-"));
  try {
    const outputBase = path.join(tempDir, "page");
    await runCommand("pdftoppm", ["-png", "-f", "1", "-l", "3", filePath, outputBase]);
    const entries = (await fs.readdir(tempDir))
      .filter((name) => name.endsWith(".png"))
      .sort();
    const chunks = [];
    for (const entry of entries) {
      const text = await ocrImage(path.join(tempDir, entry));
      if (text) {
        chunks.push(text);
      }
    }
    return cleanText(chunks.join("\n\n"));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function extractExpenseDocumentText(filePath, mimeType) {
  if (mimeType === "application/pdf") {
    const pdfText = await extractPdfText(filePath);
    if (pdfText.length >= 40) {
      return { text: pdfText, extractionSource: "PDF_TEXT" };
    }
    const ocrText = await ocrPdf(filePath);
    return { text: ocrText, extractionSource: "OCR" };
  }

  if (mimeType === "image/png" || mimeType === "image/jpeg") {
    const ocrText = await ocrImage(filePath);
    return { text: ocrText, extractionSource: "OCR" };
  }

  throw new AppError("UNSUPPORTED_DOCUMENT", "Unsupported file format. Only PDF, PNG, and JPG/JPEG are allowed.", {
    statusCode: 400,
  });
}

export async function parseExpenseDocument({ filePath, mimeType, selectedMonth, preferredProvider = null }) {
  const { text, extractionSource } = await extractExpenseDocumentText(filePath, mimeType);
  if (!text) {
    throw new AppError("DOCUMENT_EXTRACTION_FAILED", "Could not automatically read this bill.", {
      statusCode: 400,
    });
  }

  const provider = detectProviderFromText(text, preferredProvider);
  const invoiceNumber = extractInvoiceNumber(text);
  const invoiceDate = extractInvoiceDate(text);
  const billingPeriodText = extractBillingPeriodText(text);
  const billingMonth = inferBillingMonth({ periodText: billingPeriodText, invoiceDate, selectedMonth });
  const totals = extractTotals(text);
  const currency = detectCurrency(text, extractLabelValue(text, [/(?:invoice total|grand total|amount due|total amount|total due)\s*[:\-]?\s*([₹$€£A-Z0-9,.\s]+)/i]) || "");

  const fields = {
    provider,
    invoiceNumber,
    invoiceDate,
    billingMonth,
    subtotal: totals.subtotal,
    tax: totals.tax,
    total: totals.total,
    currency,
  };

  return {
    extractionSource,
    rawTextLength: text.length,
    text,
    fields,
    extractionWarnings: summarizeWarnings(fields, extractionSource),
  };
}
