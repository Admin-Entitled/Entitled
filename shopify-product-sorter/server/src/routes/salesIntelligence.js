import express from "express";
import {
  getActualSalesSummary,
  getSalesAnalyticsSlice,
  getSalesExport,
  reconcileSalesData,
  refreshShopifySalesData,
  refreshShiprocketSalesData,
} from "../services/actualSalesService.js";
import { logError } from "../utils/logger.js";

const router = express.Router();

router.post("/sales-intelligence/refresh-shopify", async (req, res) => {
  try {
    const payload = await refreshShopifySalesData({ days: req.query.days || req.body?.days });
    res.json(payload);
  } catch (error) {
    logError("Failed to refresh Shopify sales intelligence data", error, { days: req.query.days || req.body?.days });
    res.status(500).json({
      error: "Failed to refresh Shopify sales intelligence data",
      detail: error.message,
    });
  }
});

router.post("/sales-intelligence/refresh-shiprocket", async (req, res) => {
  try {
    const payload = await refreshShiprocketSalesData({ days: req.query.days || req.body?.days });
    res.json(payload);
  } catch (error) {
    logError("Failed to refresh Shiprocket sales intelligence data", error, { days: req.query.days || req.body?.days });
    res.status(500).json({
      error: "Failed to refresh Shiprocket sales intelligence data",
      detail: error.message,
    });
  }
});

router.post("/sales-intelligence/reconcile", async (req, res) => {
  try {
    const payload = await reconcileSalesData({
      days: req.query.days || req.body?.days,
      forceRefresh: Boolean(req.body?.refresh),
    });
    res.json(payload);
  } catch (error) {
    logError("Failed to reconcile sales intelligence data", error, { days: req.query.days || req.body?.days });
    res.status(500).json({
      error: "Failed to reconcile sales intelligence data",
      detail: error.message,
    });
  }
});

router.get("/sales-intelligence/summary", async (req, res) => {
  try {
    const payload = await getActualSalesSummary({
      days: req.query.days,
      refresh: String(req.query.refresh || "") === "1",
    });
    res.json(payload);
  } catch (error) {
    logError("Failed to build sales intelligence summary", error, { days: req.query.days });
    res.status(500).json({
      error: "Failed to build sales intelligence summary",
      detail: error.message,
    });
  }
});

router.get("/sales-intelligence/reconciled-orders", async (req, res) => {
  try {
    const payload = await getActualSalesSummary({
      days: req.query.days,
      refresh: String(req.query.refresh || "") === "1",
    });
    res.json({
      meta: payload.meta,
      reconciledOrders: payload.reconciledOrders,
      unmatchedShiprocketOrders: payload.unmatchedShiprocketOrders,
    });
  } catch (error) {
    logError("Failed to load reconciled sales intelligence orders", error, { days: req.query.days });
    res.status(500).json({
      error: "Failed to load reconciled sales intelligence orders",
      detail: error.message,
    });
  }
});

for (const [pathSuffix, sliceKey] of [
  ["brand-performance", "brandPerformance"],
  ["type-performance", "typePerformance"],
  ["color-performance", "colorPerformance"],
  ["sku-performance", "skuPerformance"],
  ["courier-performance", "courierPerformance"],
  ["pincode-performance", "pincodePerformance"],
  ["state-performance", "statePerformance"],
  ["city-performance", "cityPerformance"],
  ["payment-method-performance", "paymentMethodPerformance"],
  ["rto-analysis", "rtoAnalysis"],
  ["restock-suggestions", "restockSuggestions"],
  ["reconciliation-issues", "reconciliationIssues"],
  ["recommendations", "recommendations"],
  ["pending-risk", "pendingRisk"],
]) {
  router.get(`/sales-intelligence/${pathSuffix}`, async (req, res) => {
    try {
      const payload = await getSalesAnalyticsSlice(sliceKey, {
        days: req.query.days,
        refresh: String(req.query.refresh || "") === "1",
      });
      res.json(payload);
    } catch (error) {
      logError(`Failed to load sales intelligence ${sliceKey}`, error, { days: req.query.days });
      res.status(500).json({
        error: `Failed to load sales intelligence ${sliceKey}`,
        detail: error.message,
      });
    }
  });
}

router.get("/sales-intelligence/export", async (req, res) => {
  try {
    const { filename, csv } = await getSalesExport({
      type: req.query.type,
      days: req.query.days,
      refresh: String(req.query.refresh || "") === "1",
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    logError("Failed to export sales intelligence data", error, { type: req.query.type, days: req.query.days });
    res.status(500).json({
      error: "Failed to export sales intelligence data",
      detail: error.message,
    });
  }
});

router.get("/actual-sales-intelligence", async (req, res) => {
  try {
    const payload = await getActualSalesSummary({
      days: req.query.days,
      refresh: String(req.query.refresh || "") === "1",
    });
    res.json(payload);
  } catch (error) {
    logError("Failed to build actual sales intelligence", error, { days: req.query.days });
    res.status(500).json({
      error: "Failed to build actual sales intelligence",
      detail: error.message,
    });
  }
});

export default router;
