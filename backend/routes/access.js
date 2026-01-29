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
    .select("*")
    .eq("token", token)
    .single();

  if (error || !data) {
    return res.status(401).json({});
  }

  if (data.used === true) {
    return res.status(401).json({});
  }

  if (new Date(data.expires_at) < new Date()) {
    return res.status(401).json({});
  }

  // Mark token as used (one-time) if the column exists
  if (Object.prototype.hasOwnProperty.call(data, "used")) {
    const { error: useErr } = await supabase
      .from("access_sessions")
      .update({ used: true })
      .eq("token", token);

    if (useErr) {
      return res.status(500).json({ error: "Failed to activate access" });
    }
  }

  res.json({
    password: process.env.SHOPIFY_PASSWORD,
  });
});

export default router;
