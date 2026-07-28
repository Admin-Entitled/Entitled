import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import multer from "multer";
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

function errorResponse(res, error) {
  res.status(error.statusCode || 500).json({
    success: false,
    code: error.code || "ORDER_MAPPING_REQUEST_FAILED",
    message: error.message || "Order Mapping request failed",
  });
}

router.get("/orders", async (req, res) => {
  try {
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
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get("/orders/:id", async (req, res) => {
  try {
    const payload = await getOrderMappingDetails(req.params.id);
    if (!payload) {
      return res.status(404).json({
        success: false,
        code: "ORDER_MAPPING_NOT_FOUND",
        message: "Order not found",
      });
    }
    return res.json(payload);
  } catch (error) {
    return errorResponse(res, error);
  }
});

router.get("/logs/network", async (req, res) => {
  try {
    res.json(await listNetworkLogs(req.query.limit));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.get("/logs/actions", async (req, res) => {
  try {
    res.json(await listActionLogs(req.query.limit));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/sync/shopify", async (req, res) => {
  try {
    res.json(await syncOrderMappingShopify(req.body || {}));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/sync/shiprocket", async (req, res) => {
  try {
    res.json(await refreshOrderMappingShiprocket({ force: Boolean(req.body?.force) }));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/shipments/:id/refresh", async (req, res) => {
  try {
    res.json(
      await refreshOrderMappingShiprocket({
        shipmentId: req.params.id,
        force: Boolean(req.body?.force),
      }),
    );
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/shipments/:id/manual", async (req, res) => {
  if (!ORDER_MAPPING_STATUSES.includes(req.body?.normalizedStatus)) {
    return res.status(400).json({
      success: false,
      code: "ORDER_MAPPING_INVALID_STATUS",
      message: "Invalid status",
    });
  }

  try {
    res.json(
      await setManualOrderMappingShipmentStatus(
        req.params.id,
        req.body.normalizedStatus,
        String(req.body.rawStatus || ""),
        req.body.effectiveAt,
        String(req.body.remarks || ""),
        Boolean(req.body.locked),
      ),
    );
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/shipments/:id/clear-manual", async (req, res) => {
  try {
    res.json(await clearManualOrderMappingShipmentStatus(req.params.id));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/imports/preview", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        code: "ORDER_MAPPING_CSV_REQUIRED",
        message: "CSV file required",
      });
    }

    const text = await fs.readFile(req.file.path, "utf8");
    const mapping = req.body.mapping ? JSON.parse(req.body.mapping) : undefined;
    return res.json(
      await previewOrderMappingCsvImport({
        text,
        fileName: req.file.originalname,
        mapping,
      }),
    );
  } catch (error) {
    return errorResponse(res, error);
  } finally {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
  }
});

router.post("/imports/:id/commit", async (req, res) => {
  try {
    res.json(await commitOrderMappingCsvImport(req.params.id));
  } catch (error) {
    errorResponse(res, error);
  }
});

router.post("/admin/migrate-sqlite", async (req, res) => {
  try {
    res.json(await migrateOrderMappingSqliteData());
  } catch (error) {
    errorResponse(res, error);
  }
});

export default router;
