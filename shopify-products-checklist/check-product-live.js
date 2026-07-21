#!/usr/bin/env node

/**
 * Publish all ACTIVE Shopify products to the Online Store channel.
 *
 * Modes:
 * - Production (default): publishes products that are ACTIVE and not yet published.
 * - Dry run (--dry-run): reads products and performs an extra read-only validation call per target product,
 *   but does not write anything to Shopify.
 *
 * Requirements:
 * - Node 18+
 * - Credentials in .env:
 *   - SHOPIFY_STORE
 *   - SHOPIFY_CLIENT_ID
 *   - SHOPIFY_CLIENT_SECRET
 *   - Optional: SHOPIFY_ONLINE_STORE_PUBLICATION_ID (to skip publications lookup)
 * - Token returned from OAuth endpoint must have scopes:
 *   - read_products
 *   - read_publications
 *   - write_publications (production mode only)
 *
 * Usage:
 *   node check-product-live.js
 *   node check-product-live.js --dry-run
 */

const fs = require("fs");
const path = require("path");

function parseEnvValue(rawValue) {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
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

    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

function timestampForFile() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "_" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function createRunLogger(scriptDir, mode) {
  const logsDir = path.join(scriptDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });

  const filePath = path.join(
    logsDir,
    `${mode === "dry-run" ? "dry_run" : "production"}_run_${timestampForFile()}.log`
  );

  function write(level, message, meta) {
    const line = JSON.stringify({
      time: new Date().toISOString(),
      mode,
      level,
      message,
      ...(meta ? { meta } : {}),
    });
    fs.appendFileSync(filePath, `${line}\n`, "utf8");
  }

  return {
    filePath,
    info(message, meta) {
      write("INFO", message, meta);
    },
    error(message, meta) {
      write("ERROR", message, meta);
    },
  };
}

const scriptDir = __dirname;
loadEnvFile(path.join(scriptDir, ".env"));

const isDryRun = process.argv.includes("--dry-run");
const runMode = isDryRun ? "dry-run" : "production";
const logger = createRunLogger(scriptDir, runMode);

const store = process.env.SHOPIFY_STORE;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
const tokenUrl =
  process.env.SHOPIFY_TOKEN_URL || `https://${store}/admin/oauth/access_token`;
const tokenGrantType = (
  process.env.SHOPIFY_TOKEN_GRANT_TYPE || "client_credentials"
).trim();
const authCode = process.env.SHOPIFY_AUTH_CODE;
const refreshToken = process.env.SHOPIFY_REFRESH_TOKEN;
const configuredPublicationId = process.env.SHOPIFY_ONLINE_STORE_PUBLICATION_ID;

if (!store || !clientId || !clientSecret) {
  console.error(
    "Usage: SHOPIFY_STORE=... SHOPIFY_CLIENT_ID=... SHOPIFY_CLIENT_SECRET=... node check-product-live.js [--dry-run]"
  );
  process.exit(1);
}

const API_VERSION = "2025-01";
const endpoint = `https://${store}/admin/api/${API_VERSION}/graphql.json`;
let accessToken = "";

async function fetchAccessToken() {
  const body = new URLSearchParams();

  if (tokenGrantType === "authorization_code") {
    if (!authCode) {
      throw new Error(
        "SHOPIFY_AUTH_CODE is required when SHOPIFY_TOKEN_GRANT_TYPE=authorization_code"
      );
    }
    body.set("code", authCode);
    body.set("client_id", clientId);
    body.set("client_secret", clientSecret);
  } else if (tokenGrantType === "refresh_token") {
    if (!refreshToken) {
      throw new Error(
        "SHOPIFY_REFRESH_TOKEN is required when SHOPIFY_TOKEN_GRANT_TYPE=refresh_token"
      );
    }
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

  if (!res.ok) {
    throw new Error(`Token exchange failed (${res.status}): ${raw}`);
  }

  const token =
    parsed && typeof parsed.access_token === "string"
      ? parsed.access_token.trim()
      : "";

  if (!token) {
    throw new Error(`Token exchange response missing access_token: ${raw}`);
  }

  return token;
}

async function shopifyGraphQL(query, variables = {}) {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = await res.json();

  if (!res.ok || data.errors) {
    throw new Error(
      `Shopify API error: ${JSON.stringify(data.errors || data, null, 2)}`
    );
  }

  return data.data;
}

async function getOnlineStorePublicationId() {
  if (configuredPublicationId) {
    logger.info("Using publication ID from env", {
      publicationId: configuredPublicationId,
    });
    return configuredPublicationId;
  }

  const query = `
    query GetPublications {
      publications(first: 50) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;

  let data;
  try {
    data = await shopifyGraphQL(query);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("read_publications")) {
      throw new Error(
        "Missing Shopify scope: read_publications. Add read_publications + write_publications in app Admin API scopes, reinstall/reauthorize app, or set SHOPIFY_ONLINE_STORE_PUBLICATION_ID in .env."
      );
    }
    throw err;
  }
  const pubs = data.publications.edges.map((e) => e.node);
  const onlineStore = pubs.find((p) => p.name === "Online Store");

  if (!onlineStore) {
    throw new Error(
      'Could not find "Online Store" publication. Ensure this store has Online Store channel and token has read_publications scope.'
    );
  }

  return onlineStore.id;
}

async function fetchProductsPage(afterCursor, publicationId) {
  const query = `
    query ProductsPage($after: String, $publicationId: ID!) {
      products(first: 250, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          node {
            id
            title
            status
            publishedOnPublication(publicationId: $publicationId)
          }
        }
      }
    }
  `;

  const data = await shopifyGraphQL(query, {
    after: afterCursor,
    publicationId,
  });

  return data.products;
}

async function dryRunValidateProduct(productId, publicationId) {
  const query = `
    query DryRunValidate($productId: ID!, $publicationId: ID!) {
      product(id: $productId) {
        id
        status
        publishedOnPublication(publicationId: $publicationId)
      }
    }
  `;

  const data = await shopifyGraphQL(query, {
    productId,
    publicationId,
  });

  return data.product;
}

async function publishProduct(productId, publicationId) {
  const mutation = `
    mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyGraphQL(mutation, {
    id: productId,
    input: [{ publicationId }],
  });

  return data.publishablePublish.userErrors || [];
}

async function processAllActiveProductsToOnlineStore(dryRun) {
  const publicationId = await getOnlineStorePublicationId();
  let hasNextPage = true;
  let afterCursor = null;

  const summary = {
    mode: dryRun ? "dry-run" : "production",
    totalProducts: 0,
    activeProducts: 0,
    alreadyPublished: 0,
    targetProducts: 0,
    validatedOnly: 0,
    publishedNow: 0,
    skippedInactive: 0,
    failed: 0,
  };

  while (hasNextPage) {
    const page = await fetchProductsPage(afterCursor, publicationId);
    const products = page.edges.map((e) => e.node);

    for (const product of products) {
      summary.totalProducts += 1;

      if (product.status !== "ACTIVE") {
        summary.skippedInactive += 1;
        continue;
      }

      summary.activeProducts += 1;

      if (product.publishedOnPublication) {
        summary.alreadyPublished += 1;
        continue;
      }

      summary.targetProducts += 1;

      try {
        if (dryRun) {
          await dryRunValidateProduct(product.id, publicationId);
          summary.validatedOnly += 1;
          logger.info("Dry run validated product", {
            productId: product.id,
            title: product.title,
          });
        } else {
          const errors = await publishProduct(product.id, publicationId);
          if (errors.length > 0) {
            summary.failed += 1;
            logger.error("Failed to publish product", {
              productId: product.id,
              title: product.title,
              errors,
            });
          } else {
            summary.publishedNow += 1;
            logger.info("Published product", {
              productId: product.id,
              title: product.title,
            });
          }
        }
      } catch (err) {
        summary.failed += 1;
        logger.error("Product processing error", {
          productId: product.id,
          title: product.title,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    hasNextPage = page.pageInfo.hasNextPage;
    afterCursor = page.pageInfo.endCursor;
  }

  return summary;
}

(async () => {
  try {
    logger.info("Run started", { mode: runMode, store, apiVersion: API_VERSION });
    accessToken = await fetchAccessToken();
    logger.info("Access token fetched");

    const result = await processAllActiveProductsToOnlineStore(isDryRun);
    logger.info("Run completed", result);

    console.log(JSON.stringify({ ...result, logFile: logger.filePath }, null, 2));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("Run failed", { error: message });
    console.error(`Error: ${message}`);
    console.error(`Log file: ${logger.filePath}`);
    process.exit(1);
  }
})();
