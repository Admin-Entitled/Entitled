import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import multer from "multer";
import { requireAdminAuth } from "../middleware/authBoundary.js";
import { normalizeOrderMappingError, orderMappingError } from "../services/orderMappingError.js";
import {
  clearManualOrderMappingShipmentStatus,
  commitOrderMappingCsvImport,
  getOrderMappingDetails,
  listActionLogs,
  listNetworkLogs,
  listOrderMappings,
  migrateOrderMappingSqliteData,
  previewOrderMappingCsvImport,
  refreshOrderMappingShiprocket,
  setManualOrderMappingShipmentStatus,
  syncOrderMappingShopify,
} from "../services/orderMappingService.js";
import { ORDER_MAPPING_STATUSES } from "../services/orderMappingStatus.js";

const router = express.Router();

const upload = multer({
  dest: path.join(os.tmpdir(), "order-mapping"),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, done) => done(null, file.originalname.toLowerCase().endsWith(".csv")),
});

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

router.get("/orders", asyncRoute(async (req, res) => {
  res.json(
      await listOrderMappings({
        page: req.query.page,
        pageSize: req.query.pageSize,
        search: String(req.query.search || ""),
        queue: String(req.query.queue || "ALL"),
        status: String(req.query.status || "ALL"),
        courier: String(req.query.courier || "ALL"),
        source: String(req.query.source || "ALL"),
        startDate: req.query.startDate ? `${req.query.startDate}T00:00:00Z` : "",
        endDate: req.query.endDate ? `${req.query.endDate}T23:59:59Z` : "",
        sortBy: String(req.query.sortBy || "orderDate"),
        sortDirection: String(req.query.sortDirection || "desc"),
      }),
    );
}));

router.get("/orders/:id", asyncRoute(async (req, res) => {
  const payload = await getOrderMappingDetails(req.params.id);
  if (!payload) {
    throw orderMappingError("ORDER_MAPPING_NOT_FOUND", "Order not found", { statusCode: 404 });
  }
  res.json(payload);
}));

router.get("/logs/network", asyncRoute(async (req, res) => {
  res.json(await listNetworkLogs(req.query.limit));
}));

router.get("/logs/actions", asyncRoute(async (req, res) => {
  res.json(await listActionLogs(req.query.limit));
}));

router.post("/sync/shopify", asyncRoute(async (req, res) => {
  res.json(await syncOrderMappingShopify(req.body || {}));
}));

router.post("/sync/shiprocket", asyncRoute(async (req, res) => {
  res.json(await refreshOrderMappingShiprocket({ force: Boolean(req.body?.force) }));
}));

router.post("/shipments/:id/refresh", asyncRoute(async (req, res) => {
  res.json(
    await refreshOrderMappingShiprocket({
      shipmentId: req.params.id,
      force: Boolean(req.body?.force),
    }),
  );
}));

router.post("/shipments/:id/manual", asyncRoute(async (req, res) => {
  if (!ORDER_MAPPING_STATUSES.includes(req.body?.normalizedStatus)) {
    throw orderMappingError("ORDER_MAPPING_INVALID_STATUS", "Invalid status");
  }

  res.json(
    await setManualOrderMappingShipmentStatus(req.params.id, {
      normalizedStatus: req.body.normalizedStatus,
      rawStatus: String(req.body.rawStatus || ""),
      effectiveAt: req.body.effectiveAt,
      remarks: String(req.body.remarks || ""),
      locked: Boolean(req.body.locked),
      actor: req.body.actor ? String(req.body.actor) : undefined,
      metadata: req.body.metadata,
    }),
  );
}));

router.post("/shipments/:id/clear-manual", asyncRoute(async (req, res) => {
  res.json(await clearManualOrderMappingShipmentStatus(req.params.id));
}));

router.post("/imports/preview", upload.single("file"), asyncRoute(async (req, res) => {
  try {
    if (!req.file) {
      throw orderMappingError("ORDER_MAPPING_CSV_REQUIRED", "CSV file required");
    }

    const text = await fs.readFile(req.file.path, "utf8");
    let mapping;
    try {
      mapping = req.body.mapping ? JSON.parse(req.body.mapping) : undefined;
    } catch (error) {
      throw orderMappingError(
        "ORDER_MAPPING_CSV_MAPPING_INVALID",
        "CSV mapping is invalid",
        { cause: error },
      );
    }
    return res.json(
      await previewOrderMappingCsvImport({
        text,
        fileName: req.file.originalname,
        mapping,
      }),
    );
  } finally {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
  }
}));

router.post("/imports/:id/commit", asyncRoute(async (req, res) => {
  res.json(await commitOrderMappingCsvImport(req.params.id));
}));

router.post("/admin/migrate-sqlite", requireAdminAuth, asyncRoute(async (req, res) => {
  res.json(await migrateOrderMappingSqliteData());
}));

router.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const safeError = normalizeOrderMappingError(error);
  res.status(safeError.statusCode).json({
    success: false,
    code: safeError.code,
    message: safeError.message,
    ...(safeError.details === undefined ? {} : { details: safeError.details }),
  });
});

export default router;
