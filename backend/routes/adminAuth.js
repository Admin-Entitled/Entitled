import express from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../supabase.js";
import { adminSessionAuth } from "../utils/adminAuth.js";
import { logAudit } from "../utils/audit.js";
import crypto from "crypto";

const router = express.Router();

/**
 * ADMIN LOGIN
 * POST /admin/auth/login
 * body: { phone, password }
 */


router.post("/login", async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  const { data: admin } = await supabase
    .from("admin_users")
    .select("*")
    .eq("phone", phone)
    .single();

  if (!admin) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const isValid = await bcrypt.compare(password, admin.password_hash);

  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const sessionToken = crypto.randomUUID();

  await supabase.from("admin_sessions").insert({
    token: sessionToken,
    admin_phone: phone,
  });

  res.cookie("admin_session", sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ status: "ok" });
});

/**
 * CREATE ADMIN
 * POST /admin/auth/create-admin
 * body: { phone, password }
 */
router.post("/create-admin", adminSessionAuth, async (req, res) => {
  const { phone, password } = req.body;

  if (!phone || !password) {
    return res.status(400).json({ error: "Phone and password required" });
  }

  const { data: existing, error: existErr } = await supabase
    .from("admin_users")
    .select("phone")
    .eq("phone", phone)
    .maybeSingle();

  if (existErr) return res.status(400).json({ error: existErr.message });
  if (existing) return res.status(409).json({ error: "Admin already exists" });

  const hash = await bcrypt.hash(password, 10);

  const { error: insErr } = await supabase.from("admin_users").insert({
    phone,
    password_hash: hash,
    is_active: true,
  });

  if (insErr) return res.status(400).json({ error: insErr.message });

  await logAudit(req.adminPhone, "CREATE_ADMIN", { phone });

  res.json({ status: "created" });
});

/**
 * CHANGE ADMIN PASSWORD
 * POST /admin/auth/change-password
 * body: { currentPassword, newPassword }
 */
router.post("/change-password", adminSessionAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password required" });
  }

  const { data: admin, error: adminErr } = await supabase
    .from("admin_users")
    .select("password_hash")
    .eq("phone", req.adminPhone)
    .single();

  if (adminErr || !admin) {
    return res.status(400).json({ error: "Admin not found" });
  }

  const isValid = await bcrypt.compare(currentPassword, admin.password_hash);

  if (!isValid) {
    return res.status(401).json({ error: "Invalid current password" });
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  const { error: updErr } = await supabase
    .from("admin_users")
    .update({ password_hash: newHash })
    .eq("phone", req.adminPhone);

  if (updErr) return res.status(400).json({ error: updErr.message });

  await logAudit(req.adminPhone, "CHANGE_PASSWORD", {});

  res.json({ status: "updated" });
});

/**
 * ADMIN SESSION CHECK
 * GET /admin/auth/me
 */
router.get("/me", async (req, res) => {
  const sessionToken = req.cookies?.admin_session;

  if (!sessionToken) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const { data: session } = await supabase
    .from("admin_sessions")
    .select("admin_phone")
    .eq("token", sessionToken)
    .single();

  if (!session) {
    return res.status(401).json({ error: "Invalid session" });
  }

  res.json({ admin_phone: session.admin_phone });
});

/**
 * ADMIN LOGOUT
 * POST /admin/auth/logout
 */
router.post("/logout", async (req, res) => {
  const sessionId = req.cookies?.admin_session;

  if (sessionId) {
    await supabase.from("admin_sessions").delete().eq("token", sessionId);
  }

  res.clearCookie("admin_session", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
  });
  res.json({ status: "logged_out" });
});

export default router;
