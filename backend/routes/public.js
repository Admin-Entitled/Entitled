import express from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.slice(2);
  }
  return digits;
}

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

router.get("/membership/status", async (req, res) => {
  const normalizedPhone = normalizePhone(req.query.phone);

  if (normalizedPhone.length !== 10) {
    return res.status(400).json({ error: "Valid 10-digit phone is required" });
  }

  const { data: approvedRows, error: approvedErr } = await supabase
    .from("members")
    .select("id")
    .eq("phone", normalizedPhone)
    .eq("status", "approved")
    .limit(1);

  if (approvedErr) {
    return res.status(500).json({ error: approvedErr.message });
  }

  if (approvedRows?.length) {
    return res.json({ status: "approved" });
  }

  const { data: pendingRows, error: pendingErr } = await supabase
    .from("members")
    .select("id")
    .eq("phone", normalizedPhone)
    .neq("status", "approved")
    .limit(1);

  if (pendingErr) {
    return res.status(500).json({ error: pendingErr.message });
  }

  if (pendingRows?.length) {
    return res.json({ status: "pending" });
  }

  return res.json({ status: "not_found" });
});

export default router;
