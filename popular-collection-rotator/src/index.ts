/**
 * Popular Collection Rotator (Shopify + Render Cron)
 *
 * Install:
 * 1) npm install
 *
 * Run locally:
 * 1) cp .env.example .env
 * 2) Fill required env vars
 * 3) npm run dev    (TypeScript via tsx)
 * 4) npm run build && npm start
 *
 * Render Cron configuration:
 * - Service type: Cron Job
 * - Build Command: npm install && npm run build
 * - Start Command: npm start
 * - Schedule (UTC): 30 22 * * THU
 *   This equals Friday 04:00 Asia/Kolkata.
 *
 * Required env vars:
 * - SHOPIFY_STORE
 * - SHOPIFY_ADMIN_TOKEN
 * - SHOPIFY_API_VERSION (set to 2025-01)
 * - DRY_RUN (optional, set true for read-only run)
 * - POPULAR_COLLECTION_HANDLE
 * - POPULAR_COLLECTION_TITLE
 * - TARGET_COUNT
 * - LOG_DIR
 */

import "dotenv/config";
import { JsonlLogger } from "./logger";
import {
  collectionAddProducts,
  collectionRemoveProducts,
  createManualCollection,
  fetchEligibleProducts,
  getAllCollectionProducts,
  getCollectionByHandle,
  getPublicationIdByName,
  ProductLite,
  publishCollection,
  ShopifyClient,
  waitForJobDone
} from "./shopify";
import { nowIso, sampleDistinct, toInt } from "./utils";

type RunSummary = {
  type: "RUN_SUMMARY";
  timestamp: string;
  collectionHandle: string;
  counts: {
    activeFetched: number;
    eligibleInStock: number;
    selected: number;
    removed: number;
    added: number;
  };
  success: boolean;
  errors: string[];
  warnings: string[];
  durationMs: number;
};

type EnvConfig = {
  shopifyStore: string;
  shopifyAdminToken: string;
  shopifyApiVersion: string;
  shopifyClientId: string;
  shopifyClientSecret: string;
  shopifyTokenUrl: string;
  shopifyTokenGrantType: string;
  shopifyAuthCode: string;
  shopifyRefreshToken: string;
  dryRun: boolean;
  popularCollectionHandle: string;
  popularCollectionTitle: string;
  targetCount: number;
  logDir: string;
  onlineStorePublicationName: string;
  maxPool: number;
  shopifyPageSize: number;
  jobPollIntervalMs: number;
  jobPollTimeoutMs: number;
  shopifyMaxRetries: number;
};

function toBool(value: string | undefined, fallback = false): boolean {
  if (value == null) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
}

function loadConfig(): EnvConfig {
  const store = process.env.SHOPIFY_STORE?.trim();
  const directToken =
    process.env.SHOPIFY_ADMIN_TOKEN?.trim() ||
    process.env.SHOPIFY_ACCESS_TOKEN?.trim() ||
    process.env.SHOPIFY_TOKEN?.trim();
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim() || "";
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim() || "";

  const missing: string[] = [];
  if (!store) missing.push("SHOPIFY_STORE");
  if (!directToken && !(clientId && clientSecret)) {
    missing.push(
      "SHOPIFY_ADMIN_TOKEN (or SHOPIFY_ACCESS_TOKEN / SHOPIFY_TOKEN) OR SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET"
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required env vars: ${missing.join(", ")}. ` +
        `Set SHOPIFY_STORE plus one token var in .env.`
    );
  }

  if (store === "yourstore.myshopify.com" || directToken === "shpat_...") {
    throw new Error("Replace placeholder values in .env for SHOPIFY_STORE and SHOPIFY_ADMIN_TOKEN.");
  }
  const resolvedStore = store as string;

  return {
    shopifyStore: resolvedStore,
    shopifyAdminToken: directToken || "",
    shopifyApiVersion: process.env.SHOPIFY_API_VERSION || "2025-01",
    shopifyClientId: clientId,
    shopifyClientSecret: clientSecret,
    shopifyTokenUrl:
      process.env.SHOPIFY_TOKEN_URL?.trim() || `https://${resolvedStore}/admin/oauth/access_token`,
    shopifyTokenGrantType: process.env.SHOPIFY_TOKEN_GRANT_TYPE?.trim() || "client_credentials",
    shopifyAuthCode: process.env.SHOPIFY_AUTH_CODE?.trim() || "",
    shopifyRefreshToken: process.env.SHOPIFY_REFRESH_TOKEN?.trim() || "",
    dryRun: toBool(process.env.DRY_RUN, false),
    popularCollectionHandle: process.env.POPULAR_COLLECTION_HANDLE || "popular",
    popularCollectionTitle: process.env.POPULAR_COLLECTION_TITLE || "Popular",
    targetCount: toInt(process.env.TARGET_COUNT, 4),
    logDir: process.env.LOG_DIR || "./logs",
    onlineStorePublicationName: process.env.ONLINE_STORE_PUBLICATION_NAME || "Online Store",
    maxPool: toInt(process.env.MAX_POOL, 5000),
    shopifyPageSize: toInt(process.env.SHOPIFY_PAGE_SIZE, 250),
    jobPollIntervalMs: toInt(process.env.JOB_POLL_INTERVAL_MS, 2000),
    jobPollTimeoutMs: toInt(process.env.JOB_POLL_TIMEOUT_MS, 180000),
    shopifyMaxRetries: toInt(process.env.SHOPIFY_MAX_RETRIES, 5)
  };
}

async function fetchAdminTokenFromCredentials(cfg: EnvConfig): Promise<string> {
  const body = new URLSearchParams();
  body.set("grant_type", cfg.shopifyTokenGrantType);
  body.set("client_id", cfg.shopifyClientId);
  body.set("client_secret", cfg.shopifyClientSecret);

  if (cfg.shopifyTokenGrantType === "authorization_code") {
    if (!cfg.shopifyAuthCode) {
      throw new Error("SHOPIFY_AUTH_CODE is required when SHOPIFY_TOKEN_GRANT_TYPE=authorization_code");
    }
    body.set("code", cfg.shopifyAuthCode);
  } else if (cfg.shopifyTokenGrantType === "refresh_token") {
    if (!cfg.shopifyRefreshToken) {
      throw new Error("SHOPIFY_REFRESH_TOKEN is required when SHOPIFY_TOKEN_GRANT_TYPE=refresh_token");
    }
    body.set("refresh_token", cfg.shopifyRefreshToken);
  }

  const res = await fetch(cfg.shopifyTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json"
    },
    body: body.toString()
  });

  const raw = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(`Token endpoint returned non-JSON response (${res.status}): ${raw.slice(0, 300)}`);
  }

  const token = typeof parsed.access_token === "string" ? parsed.access_token.trim() : "";
  if (!res.ok || !token) {
    throw new Error(
      `Token fetch failed from ${cfg.shopifyTokenUrl} (grant_type=${cfg.shopifyTokenGrantType}, status=${res.status}).`
    );
  }

  return token;
}

async function resolveAdminToken(cfg: EnvConfig, logger: JsonlLogger): Promise<string> {
  if (cfg.shopifyAdminToken) {
    return cfg.shopifyAdminToken;
  }

  if (!(cfg.shopifyClientId && cfg.shopifyClientSecret)) {
    throw new Error(
      "Missing Shopify credentials. Set SHOPIFY_ADMIN_TOKEN or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET."
    );
  }

  logger.write("TOKEN_FETCH_ATTEMPT", {
    tokenUrl: cfg.shopifyTokenUrl,
    tokenGrantType: cfg.shopifyTokenGrantType
  });

  const token = await fetchAdminTokenFromCredentials(cfg);
  logger.write("TOKEN_FETCH_SUCCESS", {});
  return token;
}

function summarizeProducts(products: ProductLite[]): Array<Record<string, unknown>> {
  return products.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    totalInventory: p.totalInventory,
    publishedOnCurrentPublication:
      typeof p.publishedOnCurrentPublication === "boolean" ? p.publishedOnCurrentPublication : null
  }));
}

async function ensurePopularCollection(
  client: ShopifyClient,
  cfg: EnvConfig,
  logger: JsonlLogger,
  warnings: string[]
): Promise<{ id: string; title: string; handle: string; sortOrder: string } | null> {
  let collection = await getCollectionByHandle(client, cfg.popularCollectionHandle);

  if (!collection) {
    if (cfg.dryRun) {
      const warning = `Collection '${cfg.popularCollectionHandle}' not found. DRY_RUN=true skipped creation; treating collection as empty.`;
      warnings.push(warning);
      logger.write("WARNING", { message: warning });
      return null;
    }

    logger.write("COLLECTION_CREATE_ATTEMPT", {
      title: cfg.popularCollectionTitle,
      handle: cfg.popularCollectionHandle,
      sortOrder: "MANUAL"
    });

    collection = await createManualCollection(client, cfg.popularCollectionTitle, cfg.popularCollectionHandle);

    const publicationId = await getPublicationIdByName(client, cfg.onlineStorePublicationName);
    if (!publicationId) {
      const warning = `Publication '${cfg.onlineStorePublicationName}' not found; collection created but not published.`;
      warnings.push(warning);
      logger.write("WARNING", { message: warning });
    } else {
      await publishCollection(client, collection.id, publicationId);
      logger.write("COLLECTION_PUBLISHED", {
        collectionId: collection.id,
        publicationId,
        publicationName: cfg.onlineStorePublicationName
      });
    }
  }

  if (collection.sortOrder !== "MANUAL") {
    const warning = `Collection sortOrder is ${collection.sortOrder}, expected MANUAL.`;
    warnings.push(warning);
    logger.write("WARNING", { message: warning, collectionId: collection.id });
  }

  return collection;
}

async function run(): Promise<void> {
  const startedAt = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];

  const cfg = loadConfig();
  const logger = new JsonlLogger(cfg.logDir);

  const summary: RunSummary = {
    type: "RUN_SUMMARY",
    timestamp: nowIso(),
    collectionHandle: cfg.popularCollectionHandle,
    counts: {
      activeFetched: 0,
      eligibleInStock: 0,
      selected: 0,
      removed: 0,
      added: 0
    },
    success: false,
    errors,
    warnings,
    durationMs: 0
  };

  logger.write("START", {
    config: {
      shopifyStore: cfg.shopifyStore,
      shopifyApiVersion: cfg.shopifyApiVersion,
      tokenGrantType: cfg.shopifyTokenGrantType,
      tokenUrl: cfg.shopifyTokenUrl,
      dryRun: cfg.dryRun,
      popularCollectionHandle: cfg.popularCollectionHandle,
      popularCollectionTitle: cfg.popularCollectionTitle,
      targetCount: cfg.targetCount,
      logDir: cfg.logDir,
      onlineStorePublicationName: cfg.onlineStorePublicationName,
      maxPool: cfg.maxPool,
      shopifyPageSize: cfg.shopifyPageSize,
      jobPollIntervalMs: cfg.jobPollIntervalMs,
      jobPollTimeoutMs: cfg.jobPollTimeoutMs,
      shopifyMaxRetries: cfg.shopifyMaxRetries
    }
  });

  try {
    const adminToken = await resolveAdminToken(cfg, logger);

    const client = new ShopifyClient({
      store: cfg.shopifyStore,
      adminToken,
      apiVersion: cfg.shopifyApiVersion,
      maxRetries: cfg.shopifyMaxRetries
    });

    const collection = await ensurePopularCollection(client, cfg, logger, warnings);

    const pool = await fetchEligibleProducts(client, cfg.maxPool, cfg.shopifyPageSize);
    summary.counts.activeFetched = pool.fetchedActive.length;
    summary.counts.eligibleInStock = pool.eligible.length;
    if (!pool.publicationCheckApplied) {
      const warning =
        "Skipping publishedOnCurrentPublication filter because token lacks read_product_listings scope.";
      warnings.push(warning);
      logger.write("WARNING", { message: warning });
    }

    logger.write("POOL", {
      fetchedActiveCount: pool.fetchedActive.length,
      eligibleInStockCount: pool.eligible.length,
      excludedOutOfStockCount: pool.excludedOutOfStock.length,
      excludedUnpublishedCount: pool.excludedUnpublished.length,
      publicationCheckApplied: pool.publicationCheckApplied,
      excludedOutOfStock: summarizeProducts(pool.excludedOutOfStock),
      excludedUnpublished: summarizeProducts(pool.excludedUnpublished)
    });

    const selected = sampleDistinct(pool.eligible, cfg.targetCount);
    if (selected.length < cfg.targetCount) {
      const warning = `Eligible pool smaller than target. target=${cfg.targetCount}, selected=${selected.length}`;
      warnings.push(warning);
      logger.write("WARNING", { message: warning });
    }
    summary.counts.selected = selected.length;

    logger.write("SELECTION", {
      selected: selected.map((p) => ({ id: p.id, title: p.title })),
      targetCount: cfg.targetCount
    });

    const currentProducts = collection ? await getAllCollectionProducts(client, collection.id) : [];
    logger.write("COLLECTION_STATE_BEFORE", {
      collectionId: collection?.id ?? null,
      collectionHandle: collection?.handle ?? cfg.popularCollectionHandle,
      collectionMissing: !collection,
      products: summarizeProducts(currentProducts)
    });

    const removeIds = Array.from(new Set(currentProducts.map((p) => p.id)));
    if (cfg.dryRun) {
      summary.counts.removed = removeIds.length;
      logger.write("REMOVAL", {
        removedProductIds: removeIds,
        removedProducts: currentProducts.map((p) => ({ id: p.id, title: p.title })),
        jobId: null,
        completedAt: nowIso(),
        dryRunSkipped: true
      });
    } else if (removeIds.length > 0) {
      const removeJobId = await collectionRemoveProducts(client, collection!.id, removeIds);
      if (removeJobId) {
        await waitForJobDone(client, removeJobId, cfg.jobPollIntervalMs, cfg.jobPollTimeoutMs);
      }
      summary.counts.removed = removeIds.length;
      logger.write("REMOVAL", {
        removedProductIds: removeIds,
        removedProducts: currentProducts.map((p) => ({ id: p.id, title: p.title })),
        jobId: removeJobId,
        completedAt: nowIso(),
        dryRunSkipped: false
      });
    } else {
      logger.write("REMOVAL", {
        removedProductIds: [],
        removedProducts: [],
        jobId: null,
        completedAt: nowIso(),
        dryRunSkipped: false
      });
    }

    const addIds = Array.from(new Set(selected.map((p) => p.id)));
    if (cfg.dryRun) {
      summary.counts.added = addIds.length;
      logger.write("ADDITION", {
        addedProductIds: addIds,
        addedProducts: selected.map((p) => ({ id: p.id, title: p.title })),
        jobId: null,
        completedAt: nowIso(),
        dryRunSkipped: true
      });
    } else if (addIds.length > 0) {
      const addJobId = await collectionAddProducts(client, collection!.id, addIds);
      if (addJobId) {
        await waitForJobDone(client, addJobId, cfg.jobPollIntervalMs, cfg.jobPollTimeoutMs);
      }
      summary.counts.added = addIds.length;
      logger.write("ADDITION", {
        addedProductIds: addIds,
        addedProducts: selected.map((p) => ({ id: p.id, title: p.title })),
        jobId: addJobId,
        completedAt: nowIso(),
        dryRunSkipped: false
      });
    } else {
      logger.write("ADDITION", {
        addedProductIds: [],
        addedProducts: [],
        jobId: null,
        completedAt: nowIso(),
        dryRunSkipped: false
      });
    }

    summary.success = true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    logger.write("ERROR", { message });
    summary.success = false;
  } finally {
    summary.timestamp = nowIso();
    summary.durationMs = Date.now() - startedAt;
    logger.write("RUN_SUMMARY", summary);

    if (!summary.success) {
      process.exitCode = 1;
    }

    console.log(`Run complete. success=${summary.success}. logFile=${logger.path}`);
  }
}

run().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Fatal error: ${msg}`);
  process.exit(1);
});
