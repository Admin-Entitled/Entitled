import express from "express";
import { supabase } from "../supabase.js";

const router = express.Router();

router.get("/access", async (req, res) => {
  const { token } = req.query;
  const shopUrl = process.env.SHOPIFY_STORE_URL;
  const shopPassword = process.env.SHOPIFY_PASSWORD;

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

  if (!shopUrl || !shopPassword) {
    console.error("[ACCESS] Missing Shopify configuration", {
      hasShopUrl: Boolean(shopUrl),
      hasShopPassword: Boolean(shopPassword),
    });
    return res.status(500).json({
      error: "Shopify access is not configured on server. Please contact support.",
      code: "SHOPIFY_CONFIG_MISSING",
    });
  }

  let normalizedShopUrl;
  try {
    normalizedShopUrl = /^https?:\/\//i.test(shopUrl) ? shopUrl : `https://${shopUrl}`;
    const host = new URL(normalizedShopUrl).hostname.toLowerCase();
    if (host === "auth.entitledclub.com" || host === "www.auth.entitledclub.com") {
      console.error("[ACCESS] Invalid Shopify store URL points to auth domain", { host });
      return res.status(500).json({
        error: "Shopify store URL is misconfigured on server. Please contact support.",
        code: "SHOPIFY_CONFIG_INVALID_URL",
      });
    }
  } catch (parseErr) {
    console.error("[ACCESS] Invalid Shopify store URL format", { message: parseErr?.message });
    return res.status(500).json({
      error: "Shopify store URL format is invalid on server. Please contact support.",
      code: "SHOPIFY_CONFIG_INVALID_URL",
    });
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
    password: shopPassword,
    shop_url: normalizedShopUrl,
  });
});

export default router;
