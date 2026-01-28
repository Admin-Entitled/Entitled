import express from "express";

const router = express.Router();

/**
 * Health check
 */
router.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/**
 * Root public check
 */
router.get("/", (req, res) => {
  res.json({ message: "Entitled public API running" });
});

export default router;
