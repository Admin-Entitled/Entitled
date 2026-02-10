import express from "express";
import crypto from "crypto";
import { supabase } from "../supabase.js";

const router = express.Router();

function sanitizeShopPassword(raw) {
  return String(raw || "")
    .trim()
    .replace(/^['"]|['"]$/g, "");
}

function normalizeShopUrl(rawShopUrl) {
  const normalized = /^https?:\/\//i.test(rawShopUrl) ? rawShopUrl : `https://${rawShopUrl}`;
  const parsedUrl = new URL(normalized);
  const host = parsedUrl.hostname.toLowerCase();

  if (host === "auth.entitledclub.com" || host === "www.auth.entitledclub.com") {
    const err = new Error("Shopify store URL points to auth domain");
    err.code = "SHOPIFY_CONFIG_INVALID_URL";
    throw err;
  }

  // Prevent redirect loops back to the Shopify password page.
  if (parsedUrl.pathname.toLowerCase() === "/password") {
    parsedUrl.pathname = "/";
    parsedUrl.search = "";
    parsedUrl.hash = "";
  }

  return parsedUrl.toString();
}

router.get("/debug/shopify-config", (req, res) => {
  const debugToken = process.env.SHOPIFY_DEBUG_TOKEN;
  if (!debugToken) {
    return res.status(404).json({});
  }

  const provided = req.get("x-debug-token") || req.query.token;
  if (provided !== debugToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const rawShopUrl = process.env.SHOPIFY_STORE_URL;
  const rawShopPassword = process.env.SHOPIFY_PASSWORD;
  const shopPassword = sanitizeShopPassword(rawShopPassword);

  let normalizedShopUrl = null;
  let shopUrlError = null;
  try {
    if (rawShopUrl) {
      normalizedShopUrl = normalizeShopUrl(rawShopUrl);
    }
  } catch (error) {
    shopUrlError = error?.message || "Invalid Shopify URL";
  }

  const passwordHash = shopPassword
    ? crypto.createHash("sha256").update(shopPassword).digest("hex").slice(0, 12)
    : null;

  return res.json({
    hasShopUrl: Boolean(rawShopUrl),
    normalizedShopUrl,
    shopUrlError,
    hasRawShopPassword: Boolean(rawShopPassword),
    hasUsableShopPassword: Boolean(shopPassword),
    shopPasswordLength: shopPassword.length,
    shopPasswordSha256Prefix: passwordHash,
  });
});

router.get("/access", async (req, res) => {
  const { token } = req.query;
  const shopUrl = process.env.SHOPIFY_STORE_URL;
  const rawShopPassword = process.env.SHOPIFY_PASSWORD;
  const shopPassword = sanitizeShopPassword(rawShopPassword);

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
      hasShopPassword: Boolean(rawShopPassword),
      hasUsableShopPassword: Boolean(shopPassword),
    });
    return res.status(500).json({
      error: "Shopify access is not configured on server. Please contact support.",
      code: "SHOPIFY_CONFIG_MISSING",
    });
  }

  let normalizedShopUrl;
  try {
    normalizedShopUrl = normalizeShopUrl(shopUrl);
  } catch (parseErr) {
    if (parseErr?.code === "SHOPIFY_CONFIG_INVALID_URL") {
      console.error("[ACCESS] Invalid Shopify store URL points to auth domain", {
        message: parseErr?.message,
      });
      return res.status(500).json({
        error: "Shopify store URL is misconfigured on server. Please contact support.",
        code: "SHOPIFY_CONFIG_INVALID_URL",
      });
    }
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
