import express from "express";
import { supabase } from "../supabase.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();
const SESSION_DAYS = 30;

/**
 * REGISTER — Request Access
 */
router.post("/register", async (req, res) => {
  const { name, phone, email, pincode } = req.body;

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
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: "Phone is required" });
  }

  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("phone", phone)
    .single();

  if (!member) {
    return res.status(404).json({ error: "No membership found" });
  }

  if (member.status !== "approved") {
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
    return res.status(500).json({ error: insErr.message });
  }

  res.json({
    status: "approved",
    token
  });
});

export default router;
