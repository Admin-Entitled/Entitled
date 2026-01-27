import express from "express";
import { supabase } from "../supabase.js";
import { adminAuth } from "../middleware/adminAuth.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

/**
 * GET MEMBERS (with filters)
 * ?status=pending
 * ?state=Maharashtra
 * ?city=Mumbai
 */
router.get("/members", adminAuth, async (req, res) => {
  let query = supabase.from("members").select("*");

  const { status, state, city } = req.query;

  if (status) query = query.eq("status", status);
  if (state) query = query.eq("state", state);
  if (city) query = query.eq("city", city);

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
});

/**
 * APPROVE SINGLE MEMBER
 */
router.post("/approve/:id", adminAuth, async (req, res) => {
  const { id } = req.params;

  await supabase
    .from("members")
    .update({ status: "approved", approved_at: new Date() })
    .eq("id", id);

  const token = uuidv4();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);

  await supabase.from("access_sessions").insert([{
    member_id: id,
    token,
    expires_at: expires
  }]);

  res.json({ status: "approved", token });
});

/**
 * APPROVE ALL (FILTERED)
 */
router.post("/approve-all", adminAuth, async (req, res) => {
  const { status, state, city } = req.body;

  let query = supabase.from("members").select("id").eq("status", status || "pending");

  if (state) query = query.eq("state", state);
  if (city) query = query.eq("city", city);

  const { data: members } = await query;

  for (const m of members) {
    const token = uuidv4();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);

    await supabase.from("members")
      .update({ status: "approved", approved_at: new Date() })
      .eq("id", m.id);

    await supabase.from("access_sessions").insert([{
      member_id: m.id,
      token,
      expires_at: expires
    }]);
  }

  res.json({ approved_count: members.length });
});

export default router;
