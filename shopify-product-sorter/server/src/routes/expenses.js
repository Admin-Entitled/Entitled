import express from "express";
import multer from "multer";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";
import * as archiver from "archiver";
import { AppError } from "../middleware/errorBoundary.js";
import { 
  syncAllExpenses, 
  getMonthlyConsolidatedSummary 
} from "../services/expenseService.js";
import { 
  listExpenseBills, 
  upsertExpenseBill, 
  getExpenseBill,
  getExpenseBillByDocumentHash,
  getDistinctBillingMonths,
  getMonthlyHistory
} from "../repositories/expenseRepository.js";
import { 
  computeDocumentHash,
  discardImportedBillDocument,
  storeBillDocument, 
  getBillDocumentPath 
} from "../utils/documentStorage.js";
import { addNetworkLog } from "../services/sorterRuntimeService.js";
import { logError } from "../utils/logger.js";
import {
  cancelExpenseBillImports,
  confirmExpenseBillImports,
  previewExpenseBillImports,
} from "../services/expenseImportService.js";

const router = express.Router();

const upload = multer({
  dest: path.join(os.tmpdir(), "expenses-bill-uploads"),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, callback) => {
    const allowedTypes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (allowedTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(new Error("Unsupported file format. Only PDF, PNG, and JPG/JPEG are allowed."));
    }
  }
});

// GET /api/expenses/months - Distinct billing months list
router.get("/expenses/months", async (req, res, next) => {
  try {
    const months = await getDistinctBillingMonths();
    res.json({ success: true, months });
  } catch (error) {
    next(error);
  }
});

// GET /api/expenses/history - Distinct billing monthly history totals
router.get("/expenses/history", async (req, res, next) => {
  try {
    const history = await getMonthlyHistory();
    res.json({ success: true, history });
  } catch (error) {
    next(error);
  }
});

// GET /api/expenses/summary - Consolidated monthly expense summary
router.get("/expenses/summary", async (req, res, next) => {
  try {
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError("VALIDATION_ERROR", "A valid month parameter (YYYY-MM) is required", { statusCode: 400 });
    }
    const summary = await getMonthlyConsolidatedSummary(month);
    res.json({ success: true, ...summary });
  } catch (error) {
    next(error);
  }
});

// GET /api/expenses/bills - List bills for selected month
router.get("/expenses/bills", async (req, res, next) => {
  try {
    const month = req.query.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError("VALIDATION_ERROR", "A valid month parameter (YYYY-MM) is required", { statusCode: 400 });
    }
    const bills = await listExpenseBills(month);
    res.json({ success: true, bills });
  } catch (error) {
    next(error);
  }
});

// POST /api/expenses/sync - Trigger sync expense activity
router.post("/expenses/sync", async (req, res, next) => {
  try {
    const month = req.body.month;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError("VALIDATION_ERROR", "A valid month parameter (YYYY-MM) is required", { statusCode: 400 });
    }
    const bypassCache = req.body.bypassCache === true;
    const syncResult = await syncAllExpenses(month, bypassCache);
    res.json({ success: syncResult.success, results: syncResult.results, errors: syncResult.errors });
  } catch (error) {
    next(error);
  }
});

router.post("/expenses/import/preview", upload.array("files", 10), async (req, res, next) => {
  try {
    const selectedMonth = String(req.body.selectedMonth || "").trim();
    const preferredProvider = String(req.body.preferredProvider || "").trim().toUpperCase() || null;
    if (selectedMonth && !/^\d{4}-\d{2}$/.test(selectedMonth)) {
      throw new AppError("VALIDATION_ERROR", "selectedMonth must be in YYYY-MM format", { statusCode: 400 });
    }
    const files = req.files || [];
    if (!files.length) {
      throw new AppError("VALIDATION_ERROR", "At least one bill document is required", { statusCode: 400 });
    }

    const previews = await previewExpenseBillImports(files, { selectedMonth, preferredProvider });
    res.status(201).json({ success: true, previews });
  } catch (error) {
    for (const file of req.files || []) {
      if (file?.path) {
        await fs.unlink(file.path).catch(() => {});
      }
    }
    next(error);
  }
});

router.post("/expenses/import/confirm", async (req, res, next) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!items.length) {
      throw new AppError("VALIDATION_ERROR", "At least one import item is required", { statusCode: 400 });
    }

    const result = await confirmExpenseBillImports(items);
    res.status(result.saved.length ? 201 : 409).json({
      success: result.failed.length === 0,
      saved: result.saved,
      failed: result.failed,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/expenses/import/cancel", async (req, res, next) => {
  try {
    const importIds = Array.isArray(req.body?.importIds) ? req.body.importIds.filter(Boolean) : [];
    await cancelExpenseBillImports(importIds);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/expenses/bills - Manual add bill / replace existing document
router.post("/expenses/bills", upload.single("file"), async (req, res, next) => {
  try {
    const { provider, invoiceNumber, invoiceDate, billingMonth, subtotal, tax, total, currency } = req.body;

    if (!provider || !["META", "SHIPROCKET", "SHOPIFY"].includes(provider)) {
      throw new AppError("VALIDATION_ERROR", "Provider must be META, SHIPROCKET, or SHOPIFY", { statusCode: 400 });
    }
    if (!invoiceNumber || !invoiceDate || !billingMonth || !total || !currency) {
      throw new AppError("VALIDATION_ERROR", "Missing required bill metadata fields", { statusCode: 400 });
    }

    let documentStorageKey = null;
    let originalName = null;
    let documentHash = null;
    let status = "MISSING_DOCUMENT";

    if (req.file) {
      documentHash = await computeDocumentHash(req.file.path);
      const duplicateDocument = await getExpenseBillByDocumentHash(documentHash);
      if (duplicateDocument) {
        throw new AppError("DUPLICATE_DOCUMENT", "This bill document has already been uploaded.", {
          statusCode: 409,
          details: {
            existing: {
              id: duplicateDocument.id,
              provider: duplicateDocument.provider,
              invoiceNumber: duplicateDocument.invoiceNumber,
              invoiceDate: duplicateDocument.invoiceDate,
              billingMonth: duplicateDocument.billingMonth,
              total: duplicateDocument.total,
              currency: duplicateDocument.currency,
            },
          },
        });
      }
      const stored = await storeBillDocument(req.file);
      documentStorageKey = stored.storageKey;
      originalName = stored.originalName;
      documentHash = stored.documentHash;
      status = "AVAILABLE";
    }

    const bill = await upsertExpenseBill({
      provider,
      invoiceNumber,
      invoiceDate,
      billingMonth,
      subtotal: subtotal === "" || subtotal === undefined ? null : parseFloat(subtotal),
      tax: tax === "" || tax === undefined ? null : parseFloat(tax),
      total: parseFloat(total),
      currency,
      documentSource: "MANUAL",
      documentStorageKey,
      documentHash,
      documentUrl: originalName,
      status,
    });

    res.status(201).json({ success: true, bill });
  } catch (error) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    next(error);
  }
});

// GET /api/expenses/bills/:id/download - Individual bill file download
router.get("/expenses/bills/:id/download", async (req, res, next) => {
  try {
    const bill = await getExpenseBill(req.params.id);
    if (!bill) {
      throw new AppError("NOT_FOUND", "Invoice bill record not found", { statusCode: 404 });
    }
    if (bill.status === "MISSING_DOCUMENT" || !bill.documentStorageKey) {
      throw new AppError("MISSING_DOCUMENT", "Billing invoice file is unavailable for download", { statusCode: 400 });
    }

    const filePath = getBillDocumentPath(bill.documentStorageKey);
    if (!filePath) {
      throw new AppError("ACCESS_DENIED", "Invalid path traversal attempt blocked", { statusCode: 400 });
    }

    const exists = await fs.access(filePath).then(() => true).catch(() => false);
    if (!exists) {
      throw new AppError("FILE_NOT_FOUND", "The requested invoice file does not exist on disk", { statusCode: 404 });
    }

    res.download(filePath, `${bill.provider}-${bill.invoiceNumber}-${bill.billingMonth}${path.extname(bill.documentUrl)}`);
  } catch (error) {
    next(error);
  }
});

// GET /api/expenses/download - Bulk download ZIP (all bills or provider-wise)
router.get("/expenses/download", async (req, res, next) => {
  const startedAt = new Date();
  try {
    const { month, provider } = req.query;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new AppError("VALIDATION_ERROR", "A valid month parameter (YYYY-MM) is required", { statusCode: 400 });
    }

    const allBills = await listExpenseBills(month);
    const bills = allBills.filter((b) => !provider || b.provider === provider);

    const zipFilename = provider 
      ? `${provider}-${month}-Bills.zip` 
      : `Expenses-${month}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipFilename}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.pipe(res);

    // 1. Generate expense-summary.csv content
    let csvContent = "Provider,Invoice Number,Invoice Date,Subtotal,Tax,Total,Currency,Document Included\n";
    for (const b of bills) {
      const hasDoc = (b.status === "AVAILABLE" && b.documentStorageKey) ? "YES" : "NO";
      csvContent += `"${b.provider}","${b.invoiceNumber}","${b.invoiceDate}",${b.subtotal},${b.tax},${b.total},"${b.currency}","${hasDoc}"\n`;

      // 2. Add document file to zip archive under respective provider folder
      if (b.status === "AVAILABLE" && b.documentStorageKey) {
        const filePath = getBillDocumentPath(b.documentStorageKey);
        if (filePath) {
          const exists = await fs.access(filePath).then(() => true).catch(() => false);
          if (exists) {
            // Nested folder structure inside zip: Provider/filename
            const folder = provider ? "" : `${b.provider}/`;
            archive.file(filePath, { name: `${folder}${b.invoiceNumber}-${b.invoiceDate}${path.extname(b.documentUrl)}` });
          }
        }
      }
    }

    // Include the summary CSV inside the ZIP
    archive.append(csvContent, { name: "expense-summary.csv" });
    await archive.finalize();

    addNetworkLog({
      provider: provider ? provider.toLowerCase() : "all",
      operationName: "Bill Download",
      method: "GET",
      endpoint: `/api/expenses/download?month=${month}`,
      statusCode: 200,
      status: "success",
      durationMs: Date.now() - startedAt.getTime(),
      startedAt: startedAt.toISOString(),
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    logError("Consolidated bills download failed", error);
    next(error);
  }
});

export default router;
