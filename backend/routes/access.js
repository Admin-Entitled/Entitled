import express from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

router.get("/access", async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(401).json({});
  }

  const { data, error } = await supabase
    .from("access_sessions")
    .select("expires_at, used")
    .eq("token", token)
    .single();

  if (error || !data) {
    return res.status(401).json({});
  }

  if (data.used) {
    return res.status(401).json({});
  }

  if (new Date(data.expires_at) < new Date()) {
    return res.status(401).json({});
  }

  // Mark token as used (one-time)
  await supabase
    .from("access_sessions")
    .update({ used: true })
    .eq("token", token);

  res.json({
    password: process.env.SHOPIFY_PASSWORD,
  });
});

export default router;
