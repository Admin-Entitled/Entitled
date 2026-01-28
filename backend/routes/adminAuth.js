import express from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { supabase } from "../supabase.js";

const router = express.Router();

/**
 * ADMIN LOGIN
 */
router.post("/auth/login", async (req, res) => {
  const { phone, password } = req.body;

  const { data: admin } = await supabase
    .from("admin_users")
    .select("*")
    .eq("phone", phone)
    .single();

  if (!admin) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = crypto.randomUUID();

  await supabase.from("admin_sessions").insert({
    admin_phone: phone,
    token,
  });

  res.cookie("admin_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ status: "ok" });
});

/**
 * ADMIN LOGOUT
 */
router.post("/auth/logout", async (req, res) => {
  const token = req.cookies.admin_session;

  if (token) {
    await supabase.from("admin_sessions").delete().eq("token", token);
  }

  res.clearCookie("admin_session");
  res.json({ status: "logged_out" });
});

/**
 * ADMIN ME
 */
router.get("/auth/me", async (req, res) => {
  const token = req.cookies.admin_session;

  if (!token) {
    return res.status(401).json({ error: "Not logged in" });
  }

  const { data } = await supabase
    .from("admin_sessions")
    .select("admin_phone")
    .eq("token", token)
    .single();

  if (!data) {
    return res.status(401).json({ error: "Invalid session" });
  }

  res.json({ phone: data.admin_phone });
});

export default router;
