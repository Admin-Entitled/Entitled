import express from "express";
import { supabase } from "../supabase.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();
const SESSION_DAYS = 30;

function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.slice(2);
  }
  return digits;
}

function buildPhoneCandidates(rawPhone) {
  const normalized = normalizePhone(rawPhone);
  const raw = String(rawPhone || "").trim();
  const candidates = [
    raw,
    normalized,
    `91${normalized}`,
    `+91${normalized}`,
  ].filter(Boolean);
  return [...new Set(candidates)];
}

router.get("/health", (req, res) => {
  res.json({ status: "ok", scope: "auth" });
});

/**
 * REGISTER — Request Access
 */
router.post("/register", async (req, res) => {
  const { name, phone, email, pincode } = req.body || {};

  if (!name || !phone) {
    return res.status(400).json({ error: "Name and phone are required" });
  }

  const { error } = await supabase.from("members").insert([{
    name,
    phone,
    email: email || null,
    pincode: pincode || null,
    // Keep legacy columns populated so registration doesn't fail
    // if these columns are still NOT NULL in the database schema.
    address: "",
    city: "",
    state: ""
  }]);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ status: "pending" });
});

/**
 * LOGIN — Phone Only
 */
router.post("/login", async (req, res) => {
  const { phone } = req.body || {};
  const phonePreview = phone ? `***${String(phone).slice(-4)}` : "";
  const phoneCandidates = buildPhoneCandidates(phone);
  console.log("[AUTH_LOGIN] Request received", {
    hasPhone: Boolean(phone),
    phonePreview,
    candidateCount: phoneCandidates.length,
  });

  if (!phone) {
    console.warn("[AUTH_LOGIN] Missing phone in request body");
    return res.status(400).json({ error: "Phone is required" });
  }

  const { data: members, error: memberErr } = await supabase
    .from("members")
    .select("id,status,phone")
    .in("phone", phoneCandidates)
    .limit(10);
  if (memberErr) {
    console.error("[AUTH_LOGIN] Member lookup error", { message: memberErr.message });
  } else {
    const member = members?.[0];
    console.log("[AUTH_LOGIN] Member lookup complete", {
      found: Boolean(member),
      status: member?.status || null,
      memberId: member?.id || null,
      rowsMatched: members?.length || 0,
    });
  }

  const member =
    members?.find((m) => m.status === "approved") ||
    members?.find((m) => m.status === "pending") ||
    members?.[0];

  if (!member) {
    console.warn("[AUTH_LOGIN] No membership found");
    return res.json({ status: "not_found" });
  }

  if (member.status !== "approved") {
    console.log("[AUTH_LOGIN] Member not approved", { status: member.status });
    return res.json({ status: member.status });
  }

  // Approved → create access session
  const token = uuidv4();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS);

  const { error: insErr } = await supabase.from("access_sessions").insert([{
    member_id: member.id,
    token,
    expires_at: expiresAt
  }]);

  if (insErr) {
    console.error("[AUTH_LOGIN] Failed to create access session", { message: insErr.message });
    return res.status(500).json({ error: insErr.message });
  }

  console.log("[AUTH_LOGIN] Login approved and access session created", {
    memberId: member.id,
    tokenPreview: `***${token.slice(-6)}`,
    expiresAt: expiresAt.toISOString(),
  });

  res.json({
    status: "approved",
    token
  });
});

export default router;
