/**
 * Deterministic Integration Mocks & Fixtures
 * 
 * Provides mock handlers and synthetic data fixtures for Shopify GraphQL / OAuth
 * and Shiprocket API endpoints for deterministic, network-free integration testing.
 * Contains ZERO secrets, real API tokens, or customer PII.
 */

export const mockShopifyFixtures = {
  storeDomain: "mock-store.myshopify.com",
  apiVersion: "2026-04",
  accessToken: "shpat_mock_access_token_12345",
  
  collections: [
    {
      cursor: "cursor-col-1",
      node: {
        id: "gid://shopify/Collection/101",
        title: "Summer Collection",
        handle: "summer-collection",
        sortOrder: "MANUAL",
        updatedAt: "2026-07-01T10:00:00Z",
        ruleSet: { appliedDisjunctively: false },
      },
    },
    {
      cursor: "cursor-col-2",
      node: {
        id: "gid://shopify/Collection/102",
        title: "Winter Collection",
        handle: "winter-collection",
        sortOrder: "BEST_SELLING",
        updatedAt: "2026-07-02T11:00:00Z",
        ruleSet: null,
      },
    },
  ],

  products: [
    {
      cursor: "cursor-prod-1",
      node: {
        id: "gid://shopify/Product/201",
        title: "T-Shirt Classic",
        handle: "t-shirt-classic",
        productType: "Apparel",
        vendor: "MockBrand",
        status: "ACTIVE",
        tags: ["top", "cotton"],
        createdAt: "2026-06-01T00:00:00Z",
        publishedAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-07-01T00:00:00Z",
        totalInventory: 50,
        featuredImage: {
          url: "https://cdn.shopify.mock/img1.jpg",
          altText: "T-Shirt Front",
        },
        priceRangeV2: {
          minVariantPrice: { amount: "29.99", currencyCode: "USD" },
        },
        variants: {
          edges: [
            {
              node: {
                id: "gid://shopify/ProductVariant/301",
                sku: "TSHIRT-BLK-S",
                inventoryQuantity: 20,
                availableForSale: true,
                selectedOptions: [{ name: "Size", value: "S" }],
                price: "29.99",
              },
            },
            {
              node: {
                id: "gid://shopify/ProductVariant/302",
                sku: "TSHIRT-BLK-M",
                inventoryQuantity: 30,
                availableForSale: true,
                selectedOptions: [{ name: "Size", value: "M" }],
                price: "29.99",
              },
            },
          ],
        },
      },
    },
  ],

  shopCounts: {
    collectionsCount: 15,
    productsCount: 150,
  },

  throttleStatus: {
    currentlyAvailable: 950,
    maximumAvailable: 1000,
    restoreRate: 50,
    requestedQueryCost: 10,
    actualQueryCost: 8,
  },
};

export const mockShiprocketFixtures = {
  baseUrl: "https://apiv2.shiprocket.in",
  email: "mock-operator@example.com",
  password: "mock-pass-safe",
  token: "mock-shiprocket-jwt-xyz987",
  channelId: "998877",

  shipments: [
    {
      id: 5001,
      order_id: "ORD-9001",
      channel_order_id: "SHOP-1001",
      awb_code: "AWB9001",
      courier_name: "MockExpress",
      status: "DELIVERED",
      delivered_date: "2026-07-20T14:30:00Z",
      updated_at: "2026-07-20T14:35:00Z",
    },
    {
      id: 5002,
      order_id: "ORD-9002",
      channel_order_id: "SHOP-1002",
      awb_code: "AWB9002",
      courier_name: "MockSurface",
      status: "IN_TRANSIT",
      delivered_date: "",
      updated_at: "2026-07-21T09:15:00Z",
    },
  ],
};

export function createMockFetch(routeHandlers = []) {
  const originalFetch = globalThis.fetch;
  const calls = [];

  const mockFetch = async (input, init = {}) => {
    const urlString = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init.method || "GET").toUpperCase();
    
    let bodyObj = null;
    if (init.body) {
      try {
        bodyObj = JSON.parse(init.body);
      } catch {
        bodyObj = init.body;
      }
    }

    const record = { url: urlString, method, headers: init.headers, body: bodyObj, init };
    calls.push(record);

    for (const handler of routeHandlers) {
      const matched = typeof handler.match === "function"
        ? handler.match(urlString, method, record)
        : typeof handler.match === "string"
        ? urlString.includes(handler.match)
        : handler.match instanceof RegExp
        ? handler.match.test(urlString)
        : false;

      if (matched) {
        const responseData = typeof handler.response === "function"
          ? await handler.response(urlString, method, record)
          : handler.response;

        const status = responseData.status || 200;
        const headers = new Headers(responseData.headers || { "Content-Type": "application/json" });
        const bodyText = typeof responseData.body === "string"
          ? responseData.body
          : JSON.stringify(responseData.body ?? {});

        return new Response(bodyText, { status, headers });
      }
    }

    throw new Error(`[MockFetch Network Denial] Unhandled network request to: ${method} ${urlString}`);
  };

  mockFetch.calls = calls;
  mockFetch.restore = () => {
    globalThis.fetch = originalFetch;
  };

  return mockFetch;
}

export function installMockFetch(routeHandlers = []) {
  const mockFetch = createMockFetch(routeHandlers);
  globalThis.fetch = mockFetch;
  return mockFetch;
}
