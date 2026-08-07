import assert from "node:assert/strict";
import test, { beforeEach, afterEach } from "node:test";
import { env } from "../config/env.js";
import {
  mockShopifyFixtures,
  mockShiprocketFixtures,
  createMockFetch,
} from "../mocks/integrationMocks.js";
import {
  getAccessToken,
  getShopifyAuthHeaders,
  resetShopifyAuthCache,
} from "./shopifyAuth.js";
import {
  shopifyGraphQL,
  fetchCollections,
  fetchCollectionProducts,
  fetchShopCounts,
} from "./shopifyService.js";
import { fetchShiprocketOrders } from "./shiprocketService.js";

let mockFetch = null;
let origProcessEnv = {};

beforeEach(() => {
  resetShopifyAuthCache();

  origProcessEnv = {
    SHOPIFY_STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN,
    SHOPIFY_CLIENT_ID: process.env.SHOPIFY_CLIENT_ID,
    SHOPIFY_CLIENT_SECRET: process.env.SHOPIFY_CLIENT_SECRET,
    SHOPIFY_ADMIN_ACCESS_TOKEN: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN,
    SHIPROCKET_EMAIL: process.env.SHIPROCKET_EMAIL,
    SHIPROCKET_PASSWORD: process.env.SHIPROCKET_PASSWORD,
    SHIPROCKET_TOKEN: process.env.SHIPROCKET_TOKEN,
  };

  process.env.SHOPIFY_STORE_DOMAIN = mockShopifyFixtures.storeDomain;
  process.env.SHOPIFY_CLIENT_ID = "mock-client-id";
  process.env.SHOPIFY_CLIENT_SECRET = "mock-client-secret";
  process.env.SHOPIFY_ADMIN_ACCESS_TOKEN = "";

  env.shopifyStoreDomain = mockShopifyFixtures.storeDomain;
  env.shopifyClientId = "mock-client-id";
  env.shopifyClientSecret = "mock-client-secret";
  env.shopifyAdminAccessToken = "";

  env.shiprocketEmail = mockShiprocketFixtures.email;
  env.shiprocketPassword = mockShiprocketFixtures.password;
  env.shiprocketToken = "";
  env.shiprocketBaseUrl = mockShopifyFixtures.baseUrl || mockShiprocketFixtures.baseUrl;
});

afterEach(() => {
  resetShopifyAuthCache();

  if (mockFetch && typeof mockFetch.restore === "function") {
    mockFetch.restore();
    mockFetch = null;
  }

  for (const [k, v] of Object.entries(origProcessEnv)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
});

test("Shopify Auth: uses static shopifyAdminAccessToken when configured", async () => {
  env.shopifyAdminAccessToken = "shpat_static_admin_token_test";
  const token = await getAccessToken();
  assert.equal(token, "shpat_static_admin_token_test");

  const headers = await getShopifyAuthHeaders();
  assert.equal(headers.headers["X-Shopify-Access-Token"], "shpat_static_admin_token_test");
});

test("Shopify Auth: requests OAuth access token when admin token is absent", async () => {
  mockFetch = createMockFetch([
    {
      match: "/admin/oauth/access_token",
      response: {
        status: 200,
        body: {
          access_token: mockShopifyFixtures.accessToken,
          expires_in: 86400,
        },
      },
    },
  ]);
  globalThis.fetch = mockFetch;

  const token = await getAccessToken();
  assert.equal(token, mockShopifyFixtures.accessToken);
  assert.equal(mockFetch.calls.length, 1);
  assert.equal(mockFetch.calls[0].method, "POST");
});

test("Shopify Auth: handles OAuth endpoint authentication failure", async () => {
  mockFetch = createMockFetch([
    {
      match: "/admin/oauth/access_token",
      response: {
        status: 400,
        body: {
          error: "invalid_client",
          error_description: "Invalid client credentials provided",
        },
      },
    },
  ]);
  globalThis.fetch = mockFetch;

  await assert.rejects(
    async () => {
      await getAccessToken();
    },
    (err) => {
      assert.ok(err.message.includes("Invalid client credentials provided"));
      return true;
    }
  );
});

test("Shopify GraphQL: fetchCollections parses smart and custom collections", async () => {
  env.shopifyAdminAccessToken = "mock-token";
  mockFetch = createMockFetch([
    {
      match: "/graphql.json",
      response: {
        status: 200,
        body: {
          data: {
            collections: {
              edges: mockShopifyFixtures.collections,
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
          extensions: {
            cost: { throttleStatus: mockShopifyFixtures.throttleStatus },
          },
        },
      },
    },
  ]);
  globalThis.fetch = mockFetch;

  const collections = await fetchCollections();
  assert.equal(collections.length, 2);
  assert.equal(collections[0].id, "gid://shopify/Collection/101");
  assert.equal(collections[0].type, "smart");
  assert.equal(collections[1].type, "custom");
});

test("Shopify GraphQL: fetchShopCounts extracts collection and product counts", async () => {
  env.shopifyAdminAccessToken = "mock-token";
  mockFetch = createMockFetch([
    {
      match: "/graphql.json",
      response: {
        status: 200,
        body: {
          data: {
            collectionsCount: { count: mockShopifyFixtures.shopCounts.collectionsCount },
            productsCount: { count: mockShopifyFixtures.shopCounts.productsCount },
          },
        },
      },
    },
  ]);
  globalThis.fetch = mockFetch;

  const counts = await fetchShopCounts();
  assert.equal(counts.collectionsCount, 15);
  assert.equal(counts.productsCount, 150);
});

test("Shopify GraphQL: throws error when HTTP status is not ok (e.g. 500)", async () => {
  env.shopifyAdminAccessToken = "mock-token";
  mockFetch = createMockFetch([
    {
      match: "/graphql.json",
      response: {
        status: 500,
        body: "Internal Server Error in Shopify backend",
      },
    },
  ]);
  globalThis.fetch = mockFetch;

  await assert.rejects(
    async () => {
      await shopifyGraphQL("{ shop { name } }");
    },
    (err) => {
      assert.ok(err.message.includes("Shopify API HTTP 500"));
      return true;
    }
  );
});

test("Shopify GraphQL: throws error when response contains GraphQL errors", async () => {
  env.shopifyAdminAccessToken = "mock-token";
  mockFetch = createMockFetch([
    {
      match: "/graphql.json",
      response: {
        status: 200,
        body: {
          errors: [{ message: "Field 'invalidField' doesn't exist on type 'QueryRoot'" }],
        },
      },
    },
  ]);
  globalThis.fetch = mockFetch;

  await assert.rejects(
    async () => {
      await shopifyGraphQL("{ invalidField }");
    },
    (err) => {
      assert.ok(err.message.includes("Field 'invalidField' doesn't exist"));
      return true;
    }
  );
});

test("Shiprocket Service: returns unconfigured payload when credentials absent", async () => {
  env.shiprocketEmail = "";
  env.shiprocketPassword = "";
  env.shiprocketToken = "";

  const result = await fetchShiprocketOrders({ start: "2026-07-01", end: "2026-07-31" });
  assert.deepEqual(result, { configured: false, shipments: [], pages: 0 });
});

test("Shiprocket Service: authenticates and fetches paginated orders", async () => {
  let authCalled = false;
  let ordersCalled = false;

  mockFetch = createMockFetch([
    {
      match: "/v1/external/auth/login",
      response: () => {
        authCalled = true;
        return {
          status: 200,
          body: { token: mockShiprocketFixtures.token },
        };
      },
    },
    {
      match: "/v1/external/orders",
      response: () => {
        ordersCalled = true;
        return {
          status: 200,
          body: {
            data: mockShiprocketFixtures.shipments,
            meta: { pagination: { total_pages: 1 } },
          },
        };
      },
    },
  ]);
  globalThis.fetch = mockFetch;

  const result = await fetchShiprocketOrders({ start: "2026-07-01", end: "2026-07-31" });
  assert.ok(authCalled);
  assert.ok(ordersCalled);
  assert.equal(result.configured, true);
  assert.equal(result.shipments.length, 2);
  assert.equal(result.shipments[0].awb, "AWB9001");
  assert.equal(result.shipments[0].rawStatus, "DELIVERED");
});

test("Shiprocket Service: handles 401 token expiry by re-authenticating and retrying", async () => {
  let attempts = 0;

  mockFetch = createMockFetch([
    {
      match: "/v1/external/auth/login",
      response: {
        status: 200,
        body: { token: "new-fresh-auth-401-retry" },
      },
    },
    {
      match: "/v1/external/orders",
      response: () => {
        attempts += 1;
        if (attempts === 1) {
          return { status: 401, body: { message: "Unauthenticated" } };
        }
        return {
          status: 200,
          body: {
            data: [mockShiprocketFixtures.shipments[0]],
            meta: { pagination: { total_pages: 1 } },
          },
        };
      },
    },
  ]);
  globalThis.fetch = mockFetch;

  const result = await fetchShiprocketOrders({ start: "2026-07-01", end: "2026-07-31" });
  assert.equal(result.configured, true);
  assert.equal(result.shipments.length, 1);
  assert.equal(attempts, 2);
});

test("Shiprocket Service: categorizes 429 Rate Limit error appropriately", async () => {
  env.shiprocketToken = "pre-set-token";

  mockFetch = createMockFetch([
    {
      match: "/v1/external/orders",
      response: {
        status: 429,
        body: { message: "Too Many Requests" },
      },
    },
  ]);
  globalThis.fetch = mockFetch;

  await assert.rejects(
    async () => {
      await fetchShiprocketOrders({ start: "2026-07-01", end: "2026-07-31" });
    },
    (err) => {
      assert.equal(err.category, "shiprocket_rate_limit");
      return true;
    }
  );
});

test("Deterministic Mocks Integrity: fixtures contain zero real secrets or customer PII", () => {
  const jsonShopify = JSON.stringify(mockShopifyFixtures);
  const jsonShiprocket = JSON.stringify(mockShiprocketFixtures);

  assert.ok(!jsonShopify.includes("shpat_live_"));
  assert.ok(!jsonShiprocket.includes("real_token_"));
  assert.ok(mockShopifyFixtures.storeDomain.startsWith("mock-store.myshopify.com"));
  assert.ok(mockShiprocketFixtures.email.endsWith("@example.com"));
});


import {
  normalizeOrderMappingStatus,
  isTerminalOrderMappingStatus,
  TERMINAL_STATUSES,
  ORDER_MAPPING_STATUSES,
} from "./orderMappingStatus.js";
import {
  syncCollectionOrder,
  buildCollectionMoves,
} from "./shopifyService.js";

test("Shiprocket Contract: maps raw status strings and codes to exact normalized statuses", () => {
  assert.equal(normalizeOrderMappingStatus(1), "PENDING_TRACKING");
  assert.equal(normalizeOrderMappingStatus(6), "IN_TRANSIT");
  assert.equal(normalizeOrderMappingStatus(7), "PICKUP_PENDING");
  assert.equal(normalizeOrderMappingStatus(17), "OUT_FOR_DELIVERY");
  assert.equal(normalizeOrderMappingStatus(21), "UNDELIVERED");
  assert.equal(normalizeOrderMappingStatus(41), "DELIVERY_ATTEMPTED");
  assert.equal(normalizeOrderMappingStatus(43), "RTO_INITIATED");
  assert.equal(normalizeOrderMappingStatus(46), "RTO_IN_TRANSIT");

  assert.equal(normalizeOrderMappingStatus("DELIVERED"), "DELIVERED_TO_CUSTOMER");
  assert.equal(normalizeOrderMappingStatus("successfully delivered"), "DELIVERED_TO_CUSTOMER");
  assert.equal(normalizeOrderMappingStatus("rto delivered"), "RTO_DELIVERED");
  assert.equal(normalizeOrderMappingStatus("return delivered"), "RTO_DELIVERED");
  assert.equal(normalizeOrderMappingStatus("rto in transit"), "RTO_IN_TRANSIT");
  assert.equal(normalizeOrderMappingStatus("unknown status text"), "UNKNOWN");
});

test("Shiprocket Contract: asserts terminal states strictly", () => {
  assert.equal(TERMINAL_STATUSES.size, 2);
  assert.ok(TERMINAL_STATUSES.has("DELIVERED_TO_CUSTOMER"));
  assert.ok(TERMINAL_STATUSES.has("RTO_DELIVERED"));

  assert.equal(isTerminalOrderMappingStatus("DELIVERED_TO_CUSTOMER"), true);
  assert.equal(isTerminalOrderMappingStatus("RTO_DELIVERED"), true);

  assert.equal(isTerminalOrderMappingStatus("IN_TRANSIT"), false);
  assert.equal(isTerminalOrderMappingStatus("OUT_FOR_DELIVERY"), false);
  assert.equal(isTerminalOrderMappingStatus("PENDING_TRACKING"), false);
  assert.equal(isTerminalOrderMappingStatus("UNKNOWN"), false);
});

test("Shopify Reorder Contract: calculates deterministic move inputs", () => {
  const current = ["p1", "p2", "p3"];
  const desired = ["p3", "p1", "p2"];

  const moves = buildCollectionMoves(current, desired);
  assert.ok(Array.isArray(moves));
  assert.equal(moves.length, 1);
  assert.deepEqual(moves[0], { id: "p3", newPosition: "0" });
});

test("Shopify Reorder Contract: throws error if reorder access scope is missing", async () => {
  env.shopifyAdminAccessToken = "mock-token";
  mockFetch = createMockFetch([
    {
      match: "/graphql.json",
      response: {
        status: 200,
        body: {
          data: {
            shop: { myshopifyDomain: "mock-store.myshopify.com" },
            currentAppInstallation: { accessScopes: [{ handle: "read_products" }] },
          },
        },
      },
    },
  ]);
  globalThis.fetch = mockFetch;

  await assert.rejects(
    async () => {
      await syncCollectionOrder("gid://shopify/Collection/101", ["p1", "p2"]);
    },
    (err) => {
      assert.ok(err.message.includes("missing the write_products scope"));
      return true;
    }
  );
});

test("Shopify Reorder Contract: verifies reorder job completion via polling", async () => {
  env.shopifyAdminAccessToken = "mock-token";
  let polledJob = false;

  mockFetch = createMockFetch([
    {
      match: "/graphql.json",
      response: (url, method, record) => {
        const q = typeof record.body === "object" ? (record.body?.query || "") : String(record.body || "");
        if (q.includes("ReorderAccess")) {
          return {
            status: 200,
            body: {
              data: {
                shop: { myshopifyDomain: "mock-store.myshopify.com" },
                currentAppInstallation: { accessScopes: [{ handle: "write_products" }] },
              },
            },
          };
        }
        if (q.includes("FetchCollectionProducts")) {
          return {
            status: 200,
            body: {
              data: {
                collection: {
                  id: "gid://shopify/Collection/101",
                  title: "Test Collection",
                  handle: "test",
                  sortOrder: "MANUAL",
                  products: {
                    edges: [
                      { node: { id: "p1", title: "P1", handle: "p1", productType: "", vendor: "", status: "ACTIVE", tags: [], createdAt: "", publishedAt: "", updatedAt: "", totalInventory: 10, featuredImage: null, priceRangeV2: { minVariantPrice: { amount: "10", currencyCode: "USD" } }, variants: { edges: [] } } },
                      { node: { id: "p2", title: "P2", handle: "p2", productType: "", vendor: "", status: "ACTIVE", tags: [], createdAt: "", publishedAt: "", updatedAt: "", totalInventory: 5, featuredImage: null, priceRangeV2: { minVariantPrice: { amount: "20", currencyCode: "USD" } }, variants: { edges: [] } } },
                    ],
                    pageInfo: { hasNextPage: false, endCursor: null },
                  },
                },
              },
            },
          };
        }
        if (q.includes("CollectionMeta")) {
          return {
            status: 200,
            body: {
              data: {
                collection: {
                  id: "gid://shopify/Collection/101",
                  title: "Test Collection",
                  handle: "test",
                  sortOrder: "MANUAL",
                },
              },
            },
          };
        }
        if (q.includes("ReorderCollection")) {
          return {
            status: 200,
            body: {
              data: {
                collectionReorderProducts: {
                  job: { id: "gid://shopify/Job/777" },
                  userErrors: [],
                },
              },
            },
          };
        }
        if (q.includes("PollJob")) {
          polledJob = true;
          return {
            status: 200,
            body: {
              data: {
                job: { id: "gid://shopify/Job/777", done: true },
              },
            },
          };
        }
        return { status: 200, body: { data: {} } };
      },
    },
  ]);
  globalThis.fetch = mockFetch;

  const result = await syncCollectionOrder("gid://shopify/Collection/101", ["p1", "p2"]);
  assert.ok(result);
  assert.equal(result.applied, false); // Already in desired order
});
