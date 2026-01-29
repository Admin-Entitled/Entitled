import express from "express";
import bcrypt from "bcryptjs";
import { supabase } from "../supabase.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/**
 * ADMIN LOGIN
 * POST /admin/auth/login
 * body: { phone, password }
 */
router.post("/auth/login", async (req, res) => {
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
 * ADMIN LOGOUT
 * POST /admin/auth/logout
 */
router.post("/logout", async (req, res) => {
  const sessionId = req.cookies?.admin_session;

  if (sessionId) {
    await supabase.from("admin_sessions").delete().eq("session_id", sessionId);
  }

  res.clearCookie("admin_session");
  res.json({ status: "logged_out" });
});

export default router;
