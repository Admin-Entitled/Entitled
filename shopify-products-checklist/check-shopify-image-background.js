#!/usr/bin/env node

/**
 * Single-file Shopify image background checker/updater.
 *
 * Modes:
 * - Dry run (default): read + analyze only (no Shopify writes)
 * - Production (--production): analyze + update mismatched images/titles on Shopify
 *
 * Exact match rule:
 * - Background estimate must be exactly #EDEBE8 (no shade tolerance for matching)
 *
 * Usage:
 *   node check-shopify-image-background.js
 *   node check-shopify-image-background.js --production
 *   node check-shopify-image-background.js --target #EDEBE8 --limitProducts 50
 */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

function parseArgs(argv) {
  const args = {
    target: "#EDEBE8",
    minAlpha: 12,
    limitProducts: 0,
    production: false,
    regionTolerance: 36,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--target") args.target = argv[++i] || args.target;
    else if (a === "--minAlpha") args.minAlpha = Number(argv[++i] || args.minAlpha);
    else if (a === "--limitProducts") args.limitProducts = Number(argv[++i] || 0);
    else if (a === "--regionTolerance") args.regionTolerance = Number(argv[++i] || args.regionTolerance);
    else if (a === "--production") args.production = true;
  }

  return args;
}

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const key = match[1];
    const value = parseEnvValue(match[2]);
    if (process.env[key] == null || process.env[key] === "") process.env[key] = value;
  }
}

function timestampForFile() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function hexToRgb(hex) {
  const clean = String(hex).replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(c) {
  return `#${c.r.toString(16).padStart(2, "0")}${c.g.toString(16).padStart(2, "0")}${c.b.toString(16).padStart(2, "0")}`.toUpperCase();
}

function colorDistanceSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function edgeColorEstimate(raw, width, height, channels, minAlpha) {
  const rs = [];
  const gs = [];
  const bs = [];

  const add = (x, y) => {
    const idx = (y * width + x) * channels;
    const a = channels >= 4 ? raw[idx + 3] : 255;
    if (a < minAlpha) return;
    rs.push(raw[idx]);
    gs.push(raw[idx + 1]);
    bs.push(raw[idx + 2]);
  };

  for (let x = 0; x < width; x += 1) {
    add(x, 0);
    if (height > 1) add(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    add(0, y);
    if (width > 1) add(width - 1, y);
  }

  return { r: median(rs), g: median(gs), b: median(bs) };
}

function enforceBackground(raw, width, height, channels, seedColor, targetColor, regionTolerance, minAlpha) {
  const out = Buffer.from(raw);
  const visited = new Uint8Array(width * height);
  const queue = [];
  const tolSq = regionTolerance * regionTolerance;

  const visit = (x, y) => {
    const pos = y * width + x;
    if (visited[pos]) return;
    visited[pos] = 1;

    const idx = pos * channels;
    const a = channels >= 4 ? out[idx + 3] : 255;

    if (a < minAlpha) {
      out[idx] = targetColor.r;
      out[idx + 1] = targetColor.g;
      out[idx + 2] = targetColor.b;
      if (channels >= 4) out[idx + 3] = 255;
      queue.push([x, y]);
      return;
    }

    const pix = { r: out[idx], g: out[idx + 1], b: out[idx + 2] };
    if (colorDistanceSq(pix, seedColor) <= tolSq) {
      out[idx] = targetColor.r;
      out[idx + 1] = targetColor.g;
      out[idx + 2] = targetColor.b;
      if (channels >= 4) out[idx + 3] = 255;
      queue.push([x, y]);
    }
  };

  for (let x = 0; x < width; x += 1) {
    visit(x, 0);
    if (height > 1) visit(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    visit(0, y);
    if (width > 1) visit(width - 1, y);
  }

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    if (x > 0) visit(x - 1, y);
    if (x + 1 < width) visit(x + 1, y);
    if (y > 0) visit(x, y - 1);
    if (y + 1 < height) visit(x, y + 1);
  }

  return out;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function gidToNumericId(gid) {
  if (!gid) return "";
  const match = String(gid).match(/\/(\d+)$/);
  return match ? match[1] : "";
}

function normalizeWordForTitleCase(word, isFirst, isLast) {
  if (!word) return word;
  if (/^[A-Z0-9&+/.-]{2,}$/.test(word)) return word;
  if (/\d/.test(word)) return word;

  const lower = word.toLowerCase();
  const keepLower = new Set([
    "a", "an", "and", "as", "at", "but", "by", "for", "from", "in",
    "into", "nor", "of", "on", "or", "over", "per", "the", "to", "up",
    "via", "with",
  ]);

  if (!isFirst && !isLast && keepLower.has(lower)) return lower;

  const splitKeep = lower.split(/([-'/.])/g);
  return splitKeep
    .map((part) => {
      if (/^[-'/.]$/.test(part)) return part;
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

function suggestTitleFix(originalTitle) {
  const source = (originalTitle || "").trim();
  if (!source) return "";

  let t = source;
  t = t.replace(/\s+/g, " ");
  t = t.replace(/\s+([,.:;!?])/g, "$1");
  t = t.replace(/([,.:;!?])(?!\s|$)/g, "$1 ");
  t = t.replace(/\s*-\s*/g, " - ");
  t = t.replace(/\s{2,}/g, " ");
  t = t.trim();

  const words = t.split(" ").filter(Boolean);
  const cased = words.map((w, idx) => normalizeWordForTitleCase(w, idx === 0, idx === words.length - 1));

  return cased.join(" ").trim();
}

const scriptDir = __dirname;
loadEnvFile(path.join(scriptDir, ".env"));

const args = parseArgs(process.argv);
const mode = args.production ? "production" : "dry-run";

const store = process.env.SHOPIFY_STORE;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
const tokenUrl = process.env.SHOPIFY_TOKEN_URL || `https://${store}/admin/oauth/access_token`;
const tokenGrantType = (process.env.SHOPIFY_TOKEN_GRANT_TYPE || "client_credentials").trim();
const authCode = process.env.SHOPIFY_AUTH_CODE;
const refreshToken = process.env.SHOPIFY_REFRESH_TOKEN;

if (!store || !clientId || !clientSecret) {
  console.error("Missing required env: SHOPIFY_STORE, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET");
  process.exit(1);
}

const API_VERSION = "2025-01";
const graphqlEndpoint = `https://${store}/admin/api/${API_VERSION}/graphql.json`;
const restBase = `https://${store}/admin/api/${API_VERSION}`;
let accessToken = "";

async function fetchAccessToken() {
  const body = new URLSearchParams();

  if (tokenGrantType === "authorization_code") {
    if (!authCode) throw new Error("SHOPIFY_AUTH_CODE is required when SHOPIFY_TOKEN_GRANT_TYPE=authorization_code");
    body.set("code", authCode);
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  } else if (tokenGrantType === "refresh_token") {
    if (!refreshToken) throw new Error("SHOPIFY_REFRESH_TOKEN is required when SHOPIFY_TOKEN_GRANT_TYPE=refresh_token");
    body.set("grant_type", "refresh_token");
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
    body.set("refresh_token", refreshToken);
  } else {
    body.set("grant_type", "client_credentials");
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  }

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const raw = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Token exchange returned non-JSON response: ${raw}`);
  }

  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${raw}`);

  const token = parsed && typeof parsed.access_token === "string" ? parsed.access_token.trim() : "";
  if (!token) throw new Error(`Token exchange response missing access_token: ${raw}`);
  return token;
}

async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(graphqlEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(`Shopify API error: ${JSON.stringify(data.errors || data, null, 2)}`);
  }

  return data.data;
}

async function updateProductImageAttachment(productNumericId, imageNumericId, attachmentBase64) {
  const url = `${restBase}/products/${productNumericId}/images/${imageNumericId}.json`;
  const payload = {
    image: {
      id: Number(imageNumericId),
      attachment: attachmentBase64,
      filename: `bg-fixed-${imageNumericId}.png`,
    },
  };

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Image update failed (${res.status}): ${raw}`);
  }
}

async function updateProductTitle(productId, nextTitle) {
  const mutation = `
    mutation UpdateProductTitle($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
          title
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(mutation, {
    input: {
      id: productId,
      title: nextTitle,
    },
  });

  const errors = data.productUpdate && data.productUpdate.userErrors
    ? data.productUpdate.userErrors
    : [];

  if (errors.length > 0) {
    throw new Error(errors.map((e) => e.message).join("; "));
  }
}

async function fetchProductsPage(afterCursor) {
  const query = `
    query ProductsWithImages($after: String) {
      products(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor }
        edges {
          node {
            id
            title
            variants(first: 250) {
              edges { node { sku image { url } } }
            }
            images(first: 250) {
              edges { node { id url } }
            }
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, { after: afterCursor });
  return data.products;
}

async function downloadAndAnalyzeImage(url, targetRgb, minAlpha) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed (${res.status})`);

  const imageBuffer = Buffer.from(await res.arrayBuffer());
  const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

  const estimatedRgb = edgeColorEstimate(data, info.width, info.height, info.channels, minAlpha);
  const dist = Math.sqrt(colorDistanceSq(estimatedRgb, targetRgb));
  const matchesTarget =
    estimatedRgb.r === targetRgb.r &&
    estimatedRgb.g === targetRgb.g &&
    estimatedRgb.b === targetRgb.b;

  return {
    originalBuffer: imageBuffer,
    rawData: data,
    width: info.width,
    height: info.height,
    channels: info.channels,
    estimatedRgb,
    estimatedHex: rgbToHex(estimatedRgb),
    distanceFromTarget: Number(dist.toFixed(2)),
    matchesTarget,
  };
}

async function buildUpdatedImageBuffer(analysis, targetRgb, regionTolerance, minAlpha) {
  const rewrittenRaw = enforceBackground(
    analysis.rawData,
    analysis.width,
    analysis.height,
    analysis.channels,
    analysis.estimatedRgb,
    targetRgb,
    regionTolerance,
    minAlpha
  );

  return sharp(rewrittenRaw, {
    raw: {
      width: analysis.width,
      height: analysis.height,
      channels: analysis.channels,
    },
  })
    .png()
    .toBuffer();
}

async function main() {
  const logsDir = path.join(scriptDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const reportPath = path.join(logsDir, `${mode === "production" ? "production" : "dry_run"}_shopify_bg_check_${timestampForFile()}.csv`);

  const targetRgb = hexToRgb(args.target);
  accessToken = await fetchAccessToken();

  const rows = [[
    "rowType", "sku", "productId", "productTitle", "suggestedTitle", "titleStatus",
    "imageId", "imageUrl", "estimatedBackground", "targetBackground", "distanceFromTarget",
    "matchesTarget", "status", "error"
  ]];

  let afterCursor = null;
  let hasNextPage = true;
  let processedProducts = 0;
  let imagesChecked = 0;
  let matched = 0;
  let mismatched = 0;
  let updated = 0;
  let titlesChecked = 0;
  let titleMismatched = 0;
  let titlesUpdated = 0;
  let failed = 0;

  while (hasNextPage) {
    const page = await fetchProductsPage(afterCursor);

    for (const edge of page.edges) {
      const product = edge.node;
      processedProducts += 1;

      const variants = product.variants.edges.map((v) => v.node);
      const images = product.images.edges.map((i) => i.node);

      const skuByImageUrl = new Map();
      const allSkus = variants.map((v) => (v.sku || "").trim()).filter(Boolean);
      for (const variant of variants) {
        const sku = (variant.sku || "").trim();
        const imageUrl = variant.image && variant.image.url ? variant.image.url : "";
        if (!sku || !imageUrl) continue;
        if (!skuByImageUrl.has(imageUrl)) skuByImageUrl.set(imageUrl, new Set());
        skuByImageUrl.get(imageUrl).add(sku);
      }

      const productSkuIdentifier = allSkus.length > 0 ? allSkus.join("|") : "NO_SKU";
      const originalTitle = product.title || "";
      const suggestedTitle = suggestTitleFix(originalTitle);
      const titleNeedsFix = suggestedTitle !== originalTitle;
      let titleStatus = titleNeedsFix ? "TITLE_MISMATCH" : "TITLE_OK";
      let titleError = "";

      titlesChecked += 1;
      if (titleNeedsFix) {
        titleMismatched += 1;
        if (args.production) {
          try {
            await updateProductTitle(product.id, suggestedTitle);
            titlesUpdated += 1;
            titleStatus = "TITLE_UPDATED";
            console.log(`TITLE_UPDATED | sku=${productSkuIdentifier} | product=${product.id} | "${originalTitle}" -> "${suggestedTitle}"`);
          } catch (err) {
            failed += 1;
            titleStatus = "TITLE_ERROR";
            titleError = err instanceof Error ? err.message : String(err);
            console.error(`TITLE_ERROR | sku=${productSkuIdentifier} | product=${product.id} | ${titleError}`);
          }
        } else {
          console.log(`TITLE_MISMATCH | sku=${productSkuIdentifier} | product=${product.id} | "${originalTitle}" -> "${suggestedTitle}"`);
        }
      }

      rows.push([
        "TITLE", productSkuIdentifier, product.id, originalTitle, suggestedTitle, titleStatus,
        "", "", "", args.target.toUpperCase(), "", "", titleStatus, titleError
      ]);

      for (const image of images) {
        const skuSet = skuByImageUrl.get(image.url);
        const sku = skuSet && skuSet.size > 0
          ? Array.from(skuSet).join("|")
          : allSkus.length > 0
          ? allSkus.join("|")
          : "NO_SKU";

        try {
          const analysis = await downloadAndAnalyzeImage(image.url, targetRgb, args.minAlpha);
          imagesChecked += 1;

          if (analysis.matchesTarget) {
            matched += 1;
            rows.push([
              "IMAGE", sku, product.id, originalTitle, suggestedTitle, titleStatus,
              image.id, image.url, analysis.estimatedHex,
              args.target.toUpperCase(), analysis.distanceFromTarget, true, "OK", ""
            ]);
            console.log(`OK | sku=${sku} | image=${image.id} | bg=${analysis.estimatedHex}`);
            continue;
          }

          mismatched += 1;

          if (!args.production) {
            rows.push([
              "IMAGE", sku, product.id, originalTitle, suggestedTitle, titleStatus,
              image.id, image.url, analysis.estimatedHex,
              args.target.toUpperCase(), analysis.distanceFromTarget, false, "MISMATCH", ""
            ]);
            console.log(`MISMATCH | sku=${sku} | image=${image.id} | bg=${analysis.estimatedHex}`);
            continue;
          }

          const productNumericId = gidToNumericId(product.id);
          const imageNumericId = gidToNumericId(image.id);
          if (!productNumericId || !imageNumericId) {
            throw new Error("Unable to parse numeric product/image ID from GID");
          }

          const updatedBuffer = await buildUpdatedImageBuffer(
            analysis,
            targetRgb,
            args.regionTolerance,
            args.minAlpha
          );

          await updateProductImageAttachment(
            productNumericId,
            imageNumericId,
            updatedBuffer.toString("base64")
          );

          updated += 1;
          rows.push([
            "IMAGE", sku, product.id, originalTitle, suggestedTitle, titleStatus,
            image.id, image.url, analysis.estimatedHex,
            args.target.toUpperCase(), analysis.distanceFromTarget, false, "UPDATED", ""
          ]);
          console.log(`UPDATED | sku=${sku} | image=${image.id} | from=${analysis.estimatedHex} -> ${args.target.toUpperCase()}`);
        } catch (err) {
          failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          rows.push([
            "IMAGE", sku, product.id, originalTitle, suggestedTitle, titleStatus,
            image.id, image.url, "",
            args.target.toUpperCase(), "", "", "ERROR", message
          ]);
          console.error(`ERROR | sku=${sku} | image=${image.id} | ${message}`);
        }
      }

      if (args.limitProducts > 0 && processedProducts >= args.limitProducts) {
        hasNextPage = false;
        break;
      }
    }

    if (hasNextPage) {
      hasNextPage = page.pageInfo.hasNextPage;
      afterCursor = page.pageInfo.endCursor;
    }
  }

  const csvText = rows.map((r) => r.map((c) => csvEscape(c)).join(",")).join("\n");
  fs.writeFileSync(reportPath, `${csvText}\n`, "utf8");

  const summary = {
    mode,
    targetBackground: args.target.toUpperCase(),
    matchMode: "exact",
    regionTolerance: args.regionTolerance,
    minAlpha: args.minAlpha,
    processedProducts,
    imagesChecked,
    matched,
    mismatched,
    updated,
    titlesChecked,
    titleMismatched,
    titlesUpdated,
    failed,
    report: reportPath,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (!args.production && (mismatched > 0 || failed > 0)) process.exitCode = 2;
  if (args.production && failed > 0) process.exitCode = 2;
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Fatal: ${message}`);
  process.exit(1);
});
