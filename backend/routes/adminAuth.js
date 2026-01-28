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
router.post("/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({ error: "Missing credentials" });
    }

    // Fetch admin user
    const { data: admin, error } = await supabase
      .from("admin_users")
      .select("id, phone, password_hash, is_active")
      .eq("phone", phone)
      .single();

    if (error || !admin) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!admin.is_active) {
      return res.status(403).json({ error: "Admin access disabled" });
    }

    // Verify password
    const passwordOk = await bcrypt.compare(
      password,
      admin.password_hash
    );

    if (!passwordOk) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Create session
    const sessionId = uuidv4();

    await supabase.from("admin_sessions").insert({
      session_id: sessionId,
      admin_id: admin.id,
      created_at: new Date(),
    });

    // Set cookie
    res.cookie("admin_session", sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.json({ status: "ok" });
  } catch (err) {
    console.error("Admin login error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/**
 * ADMIN LOGOUT
 * POST /admin/auth/logout
 */
router.post("/logout", async (req, res) => {
  const sessionId = req.cookies?.admin_session;

  if (sessionId) {
    await supabase
      .from("admin_sessions")
      .delete()
      .eq("session_id", sessionId);
  }

  res.clearCookie("admin_session");
  res.json({ status: "logged_out" });
});

export default router;
