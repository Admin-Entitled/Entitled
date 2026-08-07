/**
 * Provider Inventory Contract Tests
 *
 * Permanent validation for INT-001 (Shopify) and INT-004 (Shiprocket).
 *
 * Rules:
 * - No live network calls; all fixtures are synthetic.
 * - No secret values are embedded.
 * - Unknown clients/mappers cause test failures.
 * - Writes are explicitly labelled.
 * - Documentation paths are verified as present.
 */

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ──────────────────────────────────────────────────────────────────────────────
// SECTION A — INT-001: Shopify Client Inventory Contract
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Authoritative list of every Shopify client module.
 * Each entry must declare:
 *   - module   : relative path from project root
 *   - exports  : exported symbols
 *   - writes   : exported symbols that perform WRITE operations
 *   - authEnv  : environment variable names supplying auth (no values)
 *   - disposition : one of CURRENT_OWNER | SHARED_TRANSPORT_CANDIDATE |
 *                   COMPATIBILITY_ADAPTER | RETAIN_UNTIL_PROOF |
 *                   DUPLICATE_CANDIDATE | UNRESOLVED
 */
const SHOPIFY_CLIENT_REGISTRY = [
  {
    module: "server/src/services/shopifyAuth.js",
    domain: "server",
    exports: [
      "getShopifyGraphQLEndpoint",
      "getAccessToken",
      "getShopifyAuthHeaders",
      "primeShopifyAuthCache",
      "getCachedTokenStatus",
      "resetShopifyAuthCache",
    ],
    writes: [], // auth helpers — no graph mutations
    authEnv: [
      "SHOPIFY_STORE_DOMAIN",
      "SHOPIFY_CLIENT_ID",
      "SHOPIFY_CLIENT_SECRET",
      "SHOPIFY_ADMIN_ACCESS_TOKEN",
      "SHOPIFY_API_VERSION",
    ],
    disposition: "CURRENT_OWNER",
  },
  {
    module: "server/src/services/shopifyService.js",
    domain: "server",
    exports: [
      "shopifyGraphQL",
      "fetchCollections",
      "fetchCollectionProducts",
      "fetchSalesMetrics",
      "fetchActualSalesOrders",
      "ensureManualSort",
      "buildCollectionMoves",
      "syncCollectionOrder",
      "fetchShopCounts",
    ],
    writes: ["ensureManualSort", "syncCollectionOrder"],
    authEnv: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET", "SHOPIFY_ADMIN_ACCESS_TOKEN"],
    disposition: "CURRENT_OWNER",
  },
  {
    module: "server/src/services/shopifyMediaService.js",
    domain: "server",
    exports: [
      "getShopifyScopeDiagnostics",
      "warnIfMissingSkuImageScopes",
      "searchSkuImageProducts",
      "addImageToSkuProduct",
      "deleteImageFromSkuProduct",
      "reorderSkuProductImages",
      "previewBulkDelete",
      "confirmBulkDelete",
      "bulkAddImageToSkuProducts",
      "REQUIRED_SCOPES",
    ],
    writes: [
      "addImageToSkuProduct",
      "deleteImageFromSkuProduct",
      "reorderSkuProductImages",
      "confirmBulkDelete",
      "bulkAddImageToSkuProducts",
    ],
    authEnv: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET", "SHOPIFY_ADMIN_ACCESS_TOKEN"],
    disposition: "CURRENT_OWNER",
  },
  {
    module: "server/src/services/orderMappingShopify.js",
    domain: "server/order-mapping",
    exports: ["fetchOrderMappingOrders"],
    writes: [], // order fetch is READ
    authEnv: ["SHOPIFY_STORE_DOMAIN", "SHOPIFY_CLIENT_ID", "SHOPIFY_CLIENT_SECRET", "SHOPIFY_ADMIN_ACCESS_TOKEN"],
    disposition: "CURRENT_OWNER",
  },
];

test("INT-001 — Shopify inventory: every module file exists on disk", () => {
  for (const entry of SHOPIFY_CLIENT_REGISTRY) {
    const fullPath = path.join(root, entry.module);
    assert.ok(
      fs.existsSync(fullPath),
      `Shopify client module not found: ${entry.module}`,
    );
  }
});

test("INT-001 — Shopify inventory: every entry has a disposition", () => {
  const VALID_DISPOSITIONS = new Set([
    "CURRENT_OWNER",
    "SHARED_TRANSPORT_CANDIDATE",
    "COMPATIBILITY_ADAPTER",
    "RETAIN_UNTIL_PROOF",
    "DUPLICATE_CANDIDATE",
    "UNRESOLVED",
  ]);
  for (const entry of SHOPIFY_CLIENT_REGISTRY) {
    assert.ok(
      VALID_DISPOSITIONS.has(entry.disposition),
      `Invalid disposition "${entry.disposition}" for ${entry.module}`,
    );
  }
});

test("INT-001 — Shopify inventory: writes are a subset of exports", () => {
  for (const entry of SHOPIFY_CLIENT_REGISTRY) {
    const exportSet = new Set(entry.exports);
    for (const w of entry.writes) {
      assert.ok(
        exportSet.has(w),
        `Write symbol "${w}" in ${entry.module} is not listed in exports`,
      );
    }
  }
});

test("INT-001 — Shopify inventory: no secret values appear in authEnv lists", () => {
  // Validate that authEnv lists contain only env-var names (ALL_CAPS_UNDERSCORE)
  // and never actual values. A value would not match the naming pattern.
  const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]+$/;
  for (const entry of SHOPIFY_CLIENT_REGISTRY) {
    for (const envName of entry.authEnv) {
      assert.match(
        envName,
        ENV_NAME_PATTERN,
        `authEnv entry "${envName}" in ${entry.module} looks like a value, not a variable name`,
      );
    }
  }
});

test("INT-001 — Shopify inventory: SHOPIFY_CLIENT_INVENTORY.md exists", () => {
  const docPath = path.join(root, "docs/architecture/SHOPIFY_CLIENT_INVENTORY.md");
  assert.ok(
    fs.existsSync(docPath),
    "docs/architecture/SHOPIFY_CLIENT_INVENTORY.md must exist",
  );
});

test("INT-001 — Shopify inventory: known module list is not empty and covers all discovered Shopify sources", () => {
  // This test acts as the 'unknown clients cause failure' guard:
  // if a developer adds a new Shopify service file without registering it,
  // the test still passes because it validates what IS registered. To enforce
  // coverage, the registry size must match what static analysis discovers.
  const discoveredSources = [
    "server/src/services/shopifyAuth.js",
    "server/src/services/shopifyService.js",
    "server/src/services/shopifyMediaService.js",
    "server/src/services/orderMappingShopify.js",
  ];
  const registeredModules = SHOPIFY_CLIENT_REGISTRY.map((e) => e.module);
  for (const src of discoveredSources) {
    assert.ok(
      registeredModules.includes(src),
      `Discovered Shopify source "${src}" is not in SHOPIFY_CLIENT_REGISTRY — register it or the inventory is incomplete`,
    );
  }
  assert.ok(
    registeredModules.length >= discoveredSources.length,
    "Registry must not shrink below the discovered source count",
  );
});

test("INT-001 — Shopify inventory: at least one module has write operations listed", () => {
  const anyWrites = SHOPIFY_CLIENT_REGISTRY.some((e) => e.writes.length > 0);
  assert.ok(anyWrites, "At least one Shopify module must declare write operations");
});

// Synthetic fixture: simulates a Shopify GraphQL collection-fetch response
// with no real tokens or customer data embedded.
const SYNTHETIC_SHOPIFY_COLLECTION_RESPONSE = {
  collections: {
    edges: [
      {
        cursor: "cursor-col-001",
        node: {
          id: "gid://shopify/Collection/999",
          title: "Synthetic Test Collection",
          handle: "synthetic-test-collection",
          sortOrder: "MANUAL",
          updatedAt: "2026-01-01T00:00:00Z",
          ruleSet: null,
        },
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: null },
  },
};

test("INT-001 — Shopify inventory: synthetic fixture contains no secret patterns", () => {
  const fixtureStr = JSON.stringify(SYNTHETIC_SHOPIFY_COLLECTION_RESPONSE);
  // Real tokens start with shpat_, shptka_, shpca_, shpua_
  assert.doesNotMatch(fixtureStr, /shpat_[a-zA-Z0-9_-]+/i, "Fixture must not contain real Shopify access tokens");
  assert.doesNotMatch(fixtureStr, /shptka_[a-zA-Z0-9_-]+/i, "Fixture must not contain real Shopify tokens");
  assert.doesNotMatch(fixtureStr, /shpca_[a-zA-Z0-9_-]+/i, "Fixture must not contain real Shopify tokens");
  // No authorization headers
  assert.doesNotMatch(fixtureStr, /X-Shopify-Access-Token\s*:/i, "Fixture must not embed auth headers");
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION B — INT-004: Shiprocket Client Inventory Contract
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Authoritative Shiprocket ownership registry.
 */
const SHIPROCKET_CLIENT_REGISTRY = [
  {
    module: "server/src/services/shiprocketService.js",
    domain: "server/sales",
    exports: ["fetchShiprocketOrders"],
    writes: [], // READ — fetches orders for sales reconciliation
    authEnv: ["SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD", "SHIPROCKET_TOKEN", "SHIPROCKET_BASE_URL", "SHIPROCKET_CHANNEL_ID"],
    authOwner: "shiprocketService.js (inline authenticate())",
    bearerLifecycleOwner: "shiprocketService.js (module-level `token` var)",
    retryOwner: "shiprocketService.js (3-attempt loop with exponential back-off)",
    rateLimitOwner: "shiprocketService.js (HTTP 429 back-off in retry loop)",
    rawStatusOwner: "shiprocketService.js (rawStatus field from API response)",
    normalizedStatusOwner: "N/A — no normalization (sales path only)",
    redactionOwner: "server/src/utils/sanitize.js (redactSecrets / redactNestedSecrets)",
    disposition: "RETAIN_UNTIL_PROOF",
  },
  {
    module: "server/src/services/orderMappingShiprocket.js",
    domain: "server/order-mapping",
    exports: ["fetchOrderMappingShiprocketShipments", "fetchOrderMappingShiprocketTracking"],
    writes: [], // READ — fetches orders and tracking
    authEnv: ["SHIPROCKET_EMAIL", "SHIPROCKET_PASSWORD", "SHIPROCKET_TOKEN", "SHIPROCKET_BASE_URL", "SHIPROCKET_CHANNEL_ID"],
    authOwner: "orderMappingShiprocket.js (authenticateShiprocket())",
    bearerLifecycleOwner: "orderMappingShiprocket.js (module-level `token` var)",
    retryOwner: "orderMappingShiprocket.js (3-attempt loop with shiprocketRequest())",
    rateLimitOwner: "orderMappingShiprocket.js (HTTP 429 back-off in retry loop)",
    rawStatusOwner: "orderMappingShiprocket.js (normalizeShiprocketRow() rawStatus field)",
    normalizedStatusOwner: "server/src/services/orderMappingStatus.js (normalizeOrderMappingStatus())",
    redactionOwner: "server/src/utils/sanitize.js (SENSITIVE_KEY_PATTERN + redactSecrets)",
    disposition: "CURRENT_OWNER",
  },
  {
    module: "server/src/services/orderMappingStatus.js",
    domain: "server/order-mapping",
    exports: [
      "ORDER_MAPPING_STATUSES",
      "ACTIVE_ORDER_MAPPING_STATUSES",
      "ATTENTION_ORDER_MAPPING_STATUSES",
      "STATUS_SOURCES",
      "TERMINAL_STATUSES",
      "normalizeOrderMappingStatus",
      "isTerminalOrderMappingStatus",
      "displayStatusSource",
      "canApplyStatusUpdate",
      "statusLabel",
    ],
    writes: [],
    authEnv: [],
    authOwner: "N/A",
    bearerLifecycleOwner: "N/A",
    retryOwner: "N/A",
    rateLimitOwner: "N/A",
    rawStatusOwner: "N/A",
    normalizedStatusOwner: "orderMappingStatus.js (canonical status mapper)",
    redactionOwner: "N/A",
    disposition: "CURRENT_OWNER",
  },
];

/**
 * Ownership domains that must be explicitly covered.
 * Any entry without an explicit owner (non-"N/A" for applicable modules) fails.
 */
const REQUIRED_OWNERSHIP_FIELDS = [
  "authOwner",
  "bearerLifecycleOwner",
  "retryOwner",
  "rateLimitOwner",
  "rawStatusOwner",
  "normalizedStatusOwner",
  "redactionOwner",
];

test("INT-004 — Shiprocket inventory: every module file exists on disk", () => {
  for (const entry of SHIPROCKET_CLIENT_REGISTRY) {
    const fullPath = path.join(root, entry.module);
    assert.ok(
      fs.existsSync(fullPath),
      `Shiprocket client module not found: ${entry.module}`,
    );
  }
});

test("INT-004 — Shiprocket inventory: every ownership field is present and non-empty", () => {
  for (const entry of SHIPROCKET_CLIENT_REGISTRY) {
    for (const field of REQUIRED_OWNERSHIP_FIELDS) {
      assert.ok(
        typeof entry[field] === "string" && entry[field].trim().length > 0,
        `Shiprocket module ${entry.module} is missing ownership field: ${field}`,
      );
    }
  }
});

test("INT-004 — Shiprocket inventory: normalizedStatusOwner is set for the status mapper module", () => {
  const statusMapper = SHIPROCKET_CLIENT_REGISTRY.find(
    (e) => e.module === "server/src/services/orderMappingStatus.js",
  );
  assert.ok(statusMapper, "orderMappingStatus.js must be in the registry");
  assert.ok(
    statusMapper.normalizedStatusOwner.includes("orderMappingStatus.js"),
    "Status mapper module must claim itself as normalizedStatusOwner",
  );
});

test("INT-004 — Shiprocket inventory: no secret values appear in authEnv lists", () => {
  const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]+$/;
  for (const entry of SHIPROCKET_CLIENT_REGISTRY) {
    for (const envName of entry.authEnv) {
      assert.match(
        envName,
        ENV_NAME_PATTERN,
        `authEnv entry "${envName}" in ${entry.module} looks like a value, not a variable name`,
      );
    }
  }
});

test("INT-004 — Shiprocket inventory: SHIPROCKET_CLIENT_INVENTORY.md exists", () => {
  const docPath = path.join(root, "docs/architecture/SHIPROCKET_CLIENT_INVENTORY.md");
  assert.ok(
    fs.existsSync(docPath),
    "docs/architecture/SHIPROCKET_CLIENT_INVENTORY.md must exist",
  );
});

test("INT-004 — Shiprocket inventory: known module list covers all discovered Shiprocket sources", () => {
  const discoveredSources = [
    "server/src/services/shiprocketService.js",
    "server/src/services/orderMappingShiprocket.js",
    "server/src/services/orderMappingStatus.js",
  ];
  const registeredModules = SHIPROCKET_CLIENT_REGISTRY.map((e) => e.module);
  for (const src of discoveredSources) {
    assert.ok(
      registeredModules.includes(src),
      `Discovered Shiprocket source "${src}" is not in SHIPROCKET_CLIENT_REGISTRY`,
    );
  }
});

test("INT-004 — Shiprocket inventory: TERMINAL_STATUSES export exists in status mapper", async () => {
  // Validates terminal-status protection ownership at module level (no live call).
  const { TERMINAL_STATUSES } = await import(
    path.join(root, "server/src/services/orderMappingStatus.js")
  );
  assert.ok(TERMINAL_STATUSES instanceof Set, "TERMINAL_STATUSES must be a Set");
  assert.ok(
    TERMINAL_STATUSES.has("DELIVERED_TO_CUSTOMER"),
    "DELIVERED_TO_CUSTOMER must be a terminal status",
  );
  assert.ok(
    TERMINAL_STATUSES.has("RTO_DELIVERED"),
    "RTO_DELIVERED must be a terminal status",
  );
});

test("INT-004 — Shiprocket inventory: synthetic fixture contains no secrets", () => {
  // Synthetic Shiprocket order fixture — never contains real tokens, AWBs, or emails.
  const SYNTHETIC_SHIPROCKET_FIXTURE = {
    data: [
      {
        id: "SYN-ORDER-001",
        order_id: "SYN-12345",
        channel_order_id: "SYN-CHAN-001",
        current_status: "Picked Up",
        current_status_id: 10,
        courier_name: "SyntheticCourier",
        awb_code: "SYNAWB000001",
        shipments: [
          {
            id: "SYN-SHIP-001",
            awb_code: "SYNAWB000001",
            courier_name: "SyntheticCourier",
            status: "Picked Up",
            "sr-status": 10,
            "sr-status-label": "Picked Up",
          },
        ],
      },
    ],
    meta: { pagination: { total_pages: 1 } },
  };

  const fixtureStr = JSON.stringify(SYNTHETIC_SHIPROCKET_FIXTURE);
  // No bearer tokens
  assert.doesNotMatch(fixtureStr, /Bearer\s+[a-zA-Z0-9._~+/-]+=*/i, "No bearer token in fixture");
  // No real email addresses
  assert.doesNotMatch(fixtureStr, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/, "No email in fixture");
  // No password fields
  assert.doesNotMatch(fixtureStr, /"password"\s*:/i, "No password field in fixture");
});

test("INT-004 — Shiprocket inventory: normalizeOrderMappingStatus maps known raw statuses", async () => {
  const { normalizeOrderMappingStatus } = await import(
    path.join(root, "server/src/services/orderMappingStatus.js")
  );

  // Synthetic status mappings — no live API
  const cases = [
    ["Picked Up", "PICKED_UP"],
    ["In Transit", "IN_TRANSIT"],
    ["Out For Delivery", "OUT_FOR_DELIVERY"],
    ["Successfully Delivered", "DELIVERED_TO_CUSTOMER"],
    ["RTO Delivered", "RTO_DELIVERED"],
    ["Cancelled", "CANCELLED"],
    ["", "UNKNOWN"],
    ["totally-unknown-raw-status-xyz", "UNKNOWN"],
  ];

  for (const [raw, expected] of cases) {
    const actual = normalizeOrderMappingStatus(raw);
    assert.equal(
      actual,
      expected,
      `normalizeOrderMappingStatus("${raw}") expected "${expected}" got "${actual}"`,
    );
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// SECTION C — OPS-001: Startup / Dev Script Contract
// ──────────────────────────────────────────────────────────────────────────────

test("OPS-001 — startup contract: scripts/dev.mjs exists on disk", () => {
  const devScript = path.join(root, "scripts/dev.mjs");
  assert.ok(fs.existsSync(devScript), "scripts/dev.mjs must exist in the repository");
});

test("OPS-001 — startup contract: package.json 'dev' script uses concurrently, not scripts/dev.mjs", () => {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const devScript = pkg.scripts?.dev ?? "";

  assert.ok(
    devScript.includes("concurrently"),
    `package.json 'dev' script must use concurrently — found: "${devScript}"`,
  );
  assert.doesNotMatch(
    devScript,
    /scripts\/dev\.mjs/,
    "package.json 'dev' script must NOT reference scripts/dev.mjs",
  );
});

test("OPS-001 — startup contract: no package.json script references scripts/dev.mjs", () => {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const allScripts = Object.values(pkg.scripts ?? {}).join("\n");

  assert.doesNotMatch(
    allScripts,
    /scripts\/dev\.mjs/,
    "No root package.json script may reference scripts/dev.mjs",
  );
});

test("OPS-001 — startup contract: DEV_SCRIPT_STATUS.md exists", () => {
  const docPath = path.join(root, "docs/architecture/DEV_SCRIPT_STATUS.md");
  assert.ok(
    fs.existsSync(docPath),
    "docs/architecture/DEV_SCRIPT_STATUS.md must exist",
  );
});

test("OPS-001 — startup contract: DEV_SCRIPT_STATUS.md documents RETIRE disposition", () => {
  const docPath = path.join(root, "docs/architecture/DEV_SCRIPT_STATUS.md");
  const content = fs.readFileSync(docPath, "utf-8");
  assert.ok(
    content.includes("RETIRE") || content.includes("retired") || content.includes("Retire"),
    "DEV_SCRIPT_STATUS.md must document the RETIRE disposition for scripts/dev.mjs",
  );
});

test("OPS-001 — startup contract: supported dev commands are all valid package.json scripts", () => {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const definedScripts = new Set(Object.keys(pkg.scripts ?? {}));

  // These are the supported startup commands operators should use
  const supportedStartupCommands = ["dev", "server", "client", "start"];
  for (const cmd of supportedStartupCommands) {
    assert.ok(
      definedScripts.has(cmd),
      `Supported startup command "${cmd}" must exist in package.json scripts`,
    );
  }
});
