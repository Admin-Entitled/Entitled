import express from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

function normalizePhoneToIndian10(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return "";
}

function buildPhoneCandidates(raw) {
  const normalized = normalizePhoneToIndian10(raw);
  if (!normalized) return [];
  const canonical = `+91${normalized}`;
  return [canonical, `91${normalized}`, normalized];
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
  const phoneCandidates = buildPhoneCandidates(req.query.phone);

  if (!phoneCandidates.length) {
    return res.status(400).json({ error: "Valid 10-digit phone is required" });
  }

  const { data: approvedRows, error: approvedErr } = await supabase
    .from("members")
    .select("id")
    .in("phone", phoneCandidates)
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
    .in("phone", phoneCandidates)
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
