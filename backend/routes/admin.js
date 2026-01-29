import express from "express";
import { supabase } from "../supabase.js";
import { adminSessionAuth } from "../utils/adminAuth.js";
import { v4 as uuidv4 } from "uuid";
import { logAudit } from "../utils/audit.js";

const router = express.Router();

/**
 * GET AUDIT LOGS
 */
router.get("/audit-logs", adminSessionAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("admin_audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return res.status(400).json({ error: error.message });

  res.json(data);
});

/**
 * GET MEMBERS (with filters)
 */
router.get("/members", adminSessionAuth, async (req, res) => {
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
router.post("/approve/:id", adminSessionAuth, async (req, res) => {
  const { id } = req.params;

  await logAudit(req.adminPhone, "APPROVE_SINGLE", { member_id: id });

  const { error: updErr } = await supabase
    .from("members")
    .update({ status: "approved", approved_at: new Date() })
    .eq("id", id);

  if (updErr) return res.status(400).json({ error: updErr.message });

  const token = uuidv4();
  const expires = new Date();
  expires.setDate(expires.getDate() + 30);

  const { error: insErr } = await supabase.from("access_sessions").insert({
    member_id: id,
    token,
    expires_at: expires,
  });

  if (insErr) return res.status(400).json({ error: insErr.message });

  res.json({ status: "approved", token });
});

/**
 * APPROVE ALL (FILTERED)
 */
router.post("/approve-all", adminSessionAuth, async (req, res) => {
  const { status, state, city } = req.body;

  await logAudit(req.adminPhone, "APPROVE_ALL", { filters: req.body });

  let query = supabase
    .from("members")
    .select("id")
    .eq("status", status || "pending");

  if (state) query = query.eq("state", state);
  if (city) query = query.eq("city", city);

  const { data: members, error: membersErr } = await query;

  if (membersErr) return res.status(400).json({ error: membersErr.message });
  if (!members || members.length === 0) return res.json({ approved_count: 0 });

  for (const m of members) {
    const token = uuidv4();
    const expires = new Date();
    expires.setDate(expires.getDate() + 30);

    const { error: updErr } = await supabase
      .from("members")
      .update({ status: "approved", approved_at: new Date() })
      .eq("id", m.id);

    if (updErr) return res.status(400).json({ error: updErr.message });

    const { error: insErr } = await supabase.from("access_sessions").insert({
      member_id: m.id,
      token,
      expires_at: expires,
    });

    if (insErr) return res.status(400).json({ error: insErr.message });
  }

  res.json({ approved_count: members.length });
});

/**
 * REMOVE SINGLE MEMBER
 */
router.delete("/remove/:id", adminSessionAuth, async (req, res) => {
  const { id } = req.params;

  await logAudit(req.adminPhone, "REMOVE_SINGLE", { member_id: id });

  const { error: delSessErr } = await supabase
    .from("access_sessions")
    .delete()
    .eq("member_id", id);
  if (delSessErr) return res.status(400).json({ error: delSessErr.message });

  const { error: delMemErr } = await supabase
    .from("members")
    .delete()
    .eq("id", id);
  if (delMemErr) return res.status(400).json({ error: delMemErr.message });

  res.json({ removed: 1 });
});

/**
 * REMOVE ALL (FILTERED)
 */
router.post("/remove-all", adminSessionAuth, async (req, res) => {
  const { status, state, city } = req.body;

  await logAudit(req.adminPhone, "REMOVE_ALL", { filters: req.body });

  let q = supabase.from("members").select("id");
  if (status) q = q.eq("status", status);
  if (state) q = q.eq("state", state);
  if (city) q = q.eq("city", city);

  const { data, error: qErr } = await q;

  if (qErr) return res.status(400).json({ error: qErr.message });

  if (!data || data.length === 0) {
    return res.json({ removed: 0 });
  }

  const ids = data.map((m) => m.id);

  const { error: delSessErr } = await supabase
    .from("access_sessions")
    .delete()
    .in("member_id", ids);
  if (delSessErr) return res.status(400).json({ error: delSessErr.message });

  const { error: delMemErr } = await supabase
    .from("members")
    .delete()
    .in("id", ids);
  if (delMemErr) return res.status(400).json({ error: delMemErr.message });

  res.json({ removed: ids.length });
});

/**
 * REMOVE BY PHONE NUMBERS (BULK)
 */
router.post("/remove-by-phones", adminSessionAuth, async (req, res) => {
  const { phones } = req.body;

  await logAudit(req.adminPhone, "REMOVE_BY_PHONES", { phones });

  if (!Array.isArray(phones) || phones.length === 0) {
    return res.status(400).json({ error: "phones array required" });
  }

  const { data, error: listErr } = await supabase
    .from("members")
    .select("id")
    .in("phone", phones);

  if (listErr) return res.status(400).json({ error: listErr.message });

  if (!data || data.length === 0) {
    return res.json({ removed: 0 });
  }

  const ids = data.map((m) => m.id);

  const { error: delSessErr } = await supabase
    .from("access_sessions")
    .delete()
    .in("member_id", ids);
  if (delSessErr) return res.status(400).json({ error: delSessErr.message });

  const { error: delMemErr } = await supabase
    .from("members")
    .delete()
    .in("id", ids);
  if (delMemErr) return res.status(400).json({ error: delMemErr.message });

  res.json({ removed: ids.length });
});

export default router;
