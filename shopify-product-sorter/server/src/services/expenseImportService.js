import {
  getExpenseBillByDocumentHash,
  getExpenseBillByInvoice,
  upsertExpenseBill,
} from "../repositories/expenseRepository.js";
import { AppError } from "../middleware/errorBoundary.js";
import {
  cleanupExpiredImportedBillDocuments,
  discardImportedBillDocument,
  finalizeImportedBillDocument,
  persistImportMetadata,
  readImportMetadata,
  stageBillImportDocument,
} from "../utils/documentStorage.js";
import { parseExpenseDocument } from "./expenseDocumentParser.js";

const PROVIDERS = ["META", "SHIPROCKET", "SHOPIFY"];

function normalizeProvider(value) {
  const provider = String(value || "").trim().toUpperCase();
  return PROVIDERS.includes(provider) ? provider : "";
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeMoney(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const parsed = Number.parseFloat(String(value).replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function buildDuplicateSummary(bill) {
  if (!bill) {
    return null;
  }
  return {
    id: bill.id,
    provider: bill.provider,
    invoiceNumber: bill.invoiceNumber,
    invoiceDate: bill.invoiceDate,
    billingMonth: bill.billingMonth,
    total: bill.total,
    currency: bill.currency,
    status: bill.status,
  };
}

function fieldValue(fields, key) {
  return fields?.[key]?.value ?? null;
}

function sanitizePreview(preview) {
  return {
    importId: preview.importId,
    filename: preview.filename,
    provider: fieldValue(preview.fields, "provider"),
    invoiceNumber: fieldValue(preview.fields, "invoiceNumber"),
    invoiceDate: fieldValue(preview.fields, "invoiceDate"),
    billingMonth: fieldValue(preview.fields, "billingMonth"),
    subtotal: fieldValue(preview.fields, "subtotal"),
    tax: fieldValue(preview.fields, "tax"),
    total: fieldValue(preview.fields, "total"),
    currency: fieldValue(preview.fields, "currency"),
    fieldStatus: Object.fromEntries(
      Object.entries(preview.fields).map(([key, value]) => [key, value.confidence]),
    ),
    fieldWarnings: Object.fromEntries(
      Object.entries(preview.fields).map(([key, value]) => [key, value.warnings || []]),
    ),
    extractionWarnings: preview.extractionWarnings || [],
    duplicateInvoice: preview.duplicateInvoice,
    duplicateDocument: preview.duplicateDocument,
    reviewRequired: preview.reviewRequired,
  };
}

async function buildDuplicateState(fields, documentHash) {
  const provider = normalizeProvider(fieldValue(fields, "provider"));
  const invoiceNumber = normalizeText(fieldValue(fields, "invoiceNumber"));
  const [duplicateInvoice, duplicateDocument] = await Promise.all([
    provider && invoiceNumber ? getExpenseBillByInvoice(provider, invoiceNumber) : null,
    documentHash ? getExpenseBillByDocumentHash(documentHash) : null,
  ]);
  return {
    duplicateInvoice: buildDuplicateSummary(duplicateInvoice),
    duplicateDocument: buildDuplicateSummary(duplicateDocument),
  };
}

function isReviewRequired(fields, duplicates) {
  const mandatoryKeys = ["provider", "invoiceNumber", "invoiceDate", "billingMonth", "total", "currency"];
  if (duplicates.duplicateInvoice || duplicates.duplicateDocument) {
    return true;
  }
  return mandatoryKeys.some((key) => {
    const field = fields[key];
    if (!field?.value) {
      return true;
    }
    return field.confidence === "LOW" || field.confidence === "MISSING";
  });
}

export async function previewExpenseBillImports(files, { selectedMonth, preferredProvider = null } = {}) {
  await cleanupExpiredImportedBillDocuments();
  const previews = [];

  for (const file of files || []) {
    const staged = await stageBillImportDocument(file);
    try {
      const parsed = await parseExpenseDocument({
        filePath: staged.stagedPath,
        mimeType: staged.mimeType,
        selectedMonth,
        preferredProvider,
      });
      const duplicates = await buildDuplicateState(parsed.fields, staged.documentHash);
      const preview = {
        importId: staged.importId,
        filename: staged.originalName,
        documentHash: staged.documentHash,
        mimeType: staged.mimeType,
        extension: staged.extension,
        stagedStorageKey: staged.stagedStorageKey,
        selectedMonth,
        preferredProvider,
        fields: parsed.fields,
        extractionWarnings: parsed.extractionWarnings,
        duplicateInvoice: duplicates.duplicateInvoice,
        duplicateDocument: duplicates.duplicateDocument,
        reviewRequired: isReviewRequired(parsed.fields, duplicates),
      };
      await persistImportMetadata(staged.importId, preview);
      previews.push(sanitizePreview(preview));
    } catch (error) {
      const fallbackPreview = {
        importId: staged.importId,
        filename: staged.originalName,
        documentHash: staged.documentHash,
        mimeType: staged.mimeType,
        extension: staged.extension,
        stagedStorageKey: staged.stagedStorageKey,
        selectedMonth,
        preferredProvider,
        fields: {
          provider: { value: preferredProvider || "NEEDS_REVIEW", confidence: preferredProvider ? "LOW" : "MISSING", warnings: [] },
          invoiceNumber: { value: "", confidence: "MISSING", warnings: ["Invoice number could not be found."] },
          invoiceDate: { value: "", confidence: "MISSING", warnings: ["Invoice date could not be found."] },
          billingMonth: { value: selectedMonth || "", confidence: selectedMonth ? "LOW" : "MISSING", warnings: selectedMonth ? ["Billing month fell back to the selected Expenses month."] : ["Billing month could not be determined."] },
          subtotal: { value: null, confidence: "MISSING", warnings: [] },
          tax: { value: null, confidence: "MISSING", warnings: [] },
          total: { value: null, confidence: "MISSING", warnings: ["Invoice total could not be confidently extracted."] },
          currency: { value: "", confidence: "MISSING", warnings: ["Currency could not be confidently determined."] },
        },
        extractionWarnings: [error.message || "Could not automatically read this bill."],
        duplicateInvoice: null,
        duplicateDocument: null,
        reviewRequired: true,
      };
      await persistImportMetadata(staged.importId, fallbackPreview);
      previews.push(sanitizePreview(fallbackPreview));
    }
  }

  return previews;
}

function validateConfirmFields(fields) {
  const provider = normalizeProvider(fields.provider);
  const invoiceNumber = normalizeText(fields.invoiceNumber);
  const invoiceDate = normalizeText(fields.invoiceDate);
  const billingMonth = normalizeText(fields.billingMonth);
  const total = normalizeMoney(fields.total);
  const currency = normalizeText(fields.currency).toUpperCase();

  if (!provider) {
    throw new AppError("VALIDATION_ERROR", "Provider must be META, SHIPROCKET, or SHOPIFY", { statusCode: 400 });
  }
  if (!invoiceNumber) {
    throw new AppError("VALIDATION_ERROR", "Invoice number is required", { statusCode: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
    throw new AppError("VALIDATION_ERROR", "Invoice date must be a valid ISO date (YYYY-MM-DD)", { statusCode: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(billingMonth)) {
    throw new AppError("VALIDATION_ERROR", "Billing month must be in YYYY-MM format", { statusCode: 400 });
  }
  if (!Number.isFinite(total)) {
    throw new AppError("VALIDATION_ERROR", "Invoice total is required", { statusCode: 400 });
  }
  if (!currency) {
    throw new AppError("VALIDATION_ERROR", "Currency is required", { statusCode: 400 });
  }

  return {
    provider,
    invoiceNumber,
    invoiceDate,
    billingMonth,
    subtotal: normalizeMoney(fields.subtotal),
    tax: normalizeMoney(fields.tax),
    total,
    currency,
  };
}

export async function confirmExpenseBillImports(items = []) {
  await cleanupExpiredImportedBillDocuments();
  const saved = [];
  const failed = [];

  for (const item of items) {
    try {
      const metadata = await readImportMetadata(item.importId);
      const fields = validateConfirmFields(item);
      const [duplicateInvoice, duplicateDocument] = await Promise.all([
        getExpenseBillByInvoice(fields.provider, fields.invoiceNumber),
        metadata.documentHash ? getExpenseBillByDocumentHash(metadata.documentHash) : null,
      ]);

      if (duplicateInvoice) {
        throw new AppError("DUPLICATE_INVOICE", "This invoice already exists.", {
          statusCode: 409,
          details: { existing: buildDuplicateSummary(duplicateInvoice) },
        });
      }

      if (duplicateDocument) {
        throw new AppError("DUPLICATE_DOCUMENT", "This bill document has already been uploaded.", {
          statusCode: 409,
          details: { existing: buildDuplicateSummary(duplicateDocument) },
        });
      }

      const stored = await finalizeImportedBillDocument(item.importId);
      const bill = await upsertExpenseBill({
        ...fields,
        documentSource: "MANUAL",
        documentUrl: stored.originalName,
        documentStorageKey: stored.storageKey,
        documentHash: stored.documentHash,
        sourceReference: `document-import:${item.importId}`,
        status: "AVAILABLE",
      });
      await discardImportedBillDocument(item.importId).catch(() => {});
      saved.push({ importId: item.importId, bill });
    } catch (error) {
      failed.push({
        importId: item.importId,
        message: error.message || "Failed to save bill",
        code: error.code || "IMPORT_CONFIRM_FAILED",
        details: error.details || null,
      });
    }
  }

  return { saved, failed };
}

export async function cancelExpenseBillImports(importIds = []) {
  await Promise.all(importIds.map((importId) => discardImportedBillDocument(importId)));
}
