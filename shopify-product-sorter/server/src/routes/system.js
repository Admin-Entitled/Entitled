import express from "express";
import { getCachedTokenStatus } from "../services/shopifyAuth.js";
import { logError } from "../utils/logger.js";

const router = express.Router();

router.get("/health", (req, res) => {
  res.json({ ok: true });
});

router.get("/debug/shopify", async (req, res) => {
  try {
    const status = await getCachedTokenStatus();
    res.json(status);
  } catch (error) {
    logError("Failed to get Shopify token status", error);
    res.status(500).json({ error: "Failed to get Shopify token status", detail: error.message });
  }
});

export default router;
