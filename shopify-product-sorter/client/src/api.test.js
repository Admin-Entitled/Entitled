import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { api } from "./orderMappingApi.js";
import { getOrderStatusDisplay, getStatusFilterLabel } from "./orderMappingView.js";
import { api as sorterApi } from "./sorterApi.js";
import * as sorterApiModule from "./sorterApi.js";
import { api as skuImageApi } from "./skuImageApi.js";
import { api as salesIntelligenceApi } from "./salesIntelligenceApi.js";

test("lists order mapping orders with selected filter", async () => {
  const original = global.fetch;
  let url = "";

  global.fetch = async (value) => {
    url = value;
    return new Response(JSON.stringify({ orders: [] }), { status: 200 });
  };

  try {
    await api.orders({ status: "UNDELIVERED", page: 2 });
  } finally {
    global.fetch = original;
  }

  assert.equal(url, "/api/order-mapping/orders?queue=ALL&status=UNDELIVERED&page=2");
});

test("lists order mapping orders with queue ALL by default", async () => {
  const original = global.fetch;
  let url = "";

  global.fetch = async (value) => {
    url = value;
    return new Response(JSON.stringify({ orders: [] }), { status: 200 });
  };

  try {
    await api.orders({ page: 1, pageSize: 500 });
  } finally {
    global.fetch = original;
  }

  assert.equal(url, "/api/order-mapping/orders?queue=ALL&page=1&pageSize=500");
});

test("updates all collections through dedicated endpoint", async () => {
  const original = global.fetch;
  let call = {};

  global.fetch = async (url, options = {}) => {
    call = { url, options };
    return new Response(JSON.stringify({ checked: 0 }), { status: 200 });
  };

  try {
    await sorterApi.reorderAllCollections();
  } finally {
    global.fetch = original;
  }

  assert.equal(call.url, "/api/collections/reorder-all-v2");
  assert.equal(call.options.method, "POST");
});

test("fetches sorter logs dedicated endpoints", async () => {
  const original = global.fetch;
  const calls = [];

  global.fetch = async (url) => {
    calls.push(url);
    return new Response(JSON.stringify({ logs: [] }), { status: 200 });
  };

  try {
    await sorterApi.getActionLogs({ afterId: 10, limit: 15 });
    await sorterApi.getNetworkLogs({ afterId: 20, limit: 25 });
  } finally {
    global.fetch = original;
  }

  assert.deepEqual(calls, [
    "/api/collections/logs/actions?afterId=10&limit=15",
    "/api/collections/logs/network?afterId=20&limit=25",
  ]);
});

test("keeps shared API error detail parsing compatible", async () => {
  const original = global.fetch;

  global.fetch = async () =>
    new Response(JSON.stringify({ detail: "Detailed failure" }), { status: 500 });

  try {
    await assert.rejects(() => sorterApi.getCollections(), /Detailed failure/);
  } finally {
    global.fetch = original;
  }
});

test("keeps SKU image FormData upload headers browser-owned", async () => {
  const original = global.fetch;
  const formData = new FormData();
  let call = {};

  formData.append("file", new Blob(["sku image"]), "sku.png");
  global.fetch = async (url, options = {}) => {
    call = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    await skuImageApi.addSkuImageUpload(formData);
  } finally {
    global.fetch = original;
  }

  assert.equal(call.url, "/api/sku-images/add-upload");
  assert.equal(call.options.body, formData);
  assert.equal(call.options.headers["Content-Type"], undefined);
});

test("keeps sales intelligence CSV export URL compatible", () => {
  assert.equal(
    salesIntelligenceApi.salesIntelligenceExportUrl("sku summary", 45),
    "/api/sales-intelligence/export?type=sku%20summary&days=45",
  );
});

test("syncs Shopify orders through the Order Mapping endpoint", async () => {
  const original = global.fetch;
  let call = {};

  global.fetch = async (url, options = {}) => {
    call = { url, options };
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    await api.syncShopify({ start: "2026-07-01", end: "2026-07-23" });
  } finally {
    global.fetch = original;
  }

  assert.equal(call.url, "/api/order-mapping/sync/shopify");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.body, JSON.stringify({ start: "2026-07-01", end: "2026-07-23" }));
});

test("refreshes Shiprocket using a force flag", async () => {
  const original = global.fetch;
  let call = {};

  global.fetch = async (url, options = {}) => {
    call = { url, options };
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  };

  try {
    await api.refreshShiprocket(true);
  } finally {
    global.fetch = original;
  }

  assert.equal(call.url, "/api/order-mapping/sync/shiprocket");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.body, JSON.stringify({ force: true }));
});

test("shows not found on Shiprocket when no Shiprocket match exists", () => {
  assert.deepEqual(
    getOrderStatusDisplay({
      cancellation_status: null,
      shiprocket_response_id: null,
      shiprocket_channel_reference: "",
      normalized_status: "UNKNOWN",
      raw_status: "",
    }),
    {
      tone: "not-found",
      label: "Not found on Shiprocket",
      detail: "Channel order ID not found",
    },
  );
});

test("shows cancelled only for cancelled Shopify orders", () => {
  assert.deepEqual(
    getOrderStatusDisplay({
      cancellation_status: "2026-07-23T10:00:00Z",
      shiprocket_response_id: "123",
      shiprocket_channel_reference: "1240",
      normalized_status: "IN_TRANSIT",
      raw_status: "In Transit",
    }),
    {
      tone: "cancelled",
      label: "Cancelled",
      detail: "Cancelled in Shopify",
    },
  );
});

test("shows normalized Shiprocket status when available", () => {
  assert.deepEqual(
    getOrderStatusDisplay({
      cancellation_status: null,
      shiprocket_response_id: "123",
      shiprocket_channel_reference: "1240",
      normalized_status: "DELIVERED_TO_CUSTOMER",
      raw_status: "Delivered",
    }),
    {
      tone: "status",
      label: "Delivered To Customer",
      detail: "Delivered",
    },
  );
});

test("getStatusFilterLabel formats status labels correctly for UI navigation", () => {
  assert.equal(getStatusFilterLabel("ALL"), "All Statuses");
  assert.equal(getStatusFilterLabel("DELIVERED_TO_CUSTOMER"), "Delivered To Customer");
  assert.equal(getStatusFilterLabel("PENDING_TRACKING"), "Pending Tracking");
});


// ===== FE-008: Frontend API client isolation =====
test("FE-008: all four domain clients delegate to the shared api.js transport", () => {
  for (const f of ["./api.js", "./sorterApi.js", "./skuImageApi.js", "./salesIntelligenceApi.js", "./orderMappingApi.js"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.ok(src.length > 0, `${f} must exist`);
  }
  const orderMappingSrc = readFileSync(new URL("./orderMappingApi.js", import.meta.url), "utf8");
  // The Order Mapping client must reuse the shared transport, not duplicate it.
  assert.match(orderMappingSrc, /import \{ request \} from "\.\/api\.js"/, "orderMappingApi must import the shared request transport");
  assert.ok(!orderMappingSrc.includes('const API_BASE = "/api/order-mapping"'), "orderMappingApi must not define a private API base");
  const sorterSrc = readFileSync(new URL("./sorterApi.js", import.meta.url), "utf8");
  assert.match(sorterSrc, /import \{ request \} from "\.\/api\.js"/, "sorterApi must import the shared request transport");
  const skuSrc = readFileSync(new URL("./skuImageApi.js", import.meta.url), "utf8");
  assert.match(skuSrc, /import \{ request \} from "\.\/api\.js"/, "skuImageApi must import the shared request transport");
  const salesSrc = readFileSync(new URL("./salesIntelligenceApi.js", import.meta.url), "utf8");
  assert.match(salesSrc, /import \{ request \} from "\.\/api\.js"/, "salesIntelligenceApi must import the shared request transport");
});

test("FE-008: generic api.js transport is pure (no domain routes, no circular imports)", () => {
  const src = readFileSync(new URL("./api.js", import.meta.url), "utf8");
  // api.js must not import any domain client (no circular imports).
  assert.ok(!src.includes("./sorterApi"), "api.js must not import sorterApi");
  assert.ok(!src.includes("./skuImageApi"), "api.js must not import skuImageApi");
  assert.ok(!src.includes("./orderMappingApi"), "api.js must not import orderMappingApi");
  assert.ok(!src.includes("./salesIntelligenceApi"), "api.js must not import salesIntelligenceApi");
  // api.js must contain no domain endpoints.
  assert.ok(!src.includes("/collections"), "api.js must stay free of domain routes");
  assert.ok(!src.includes("/sku-images"), "api.js must stay free of domain routes");
  assert.ok(!src.includes("/sales-intelligence"), "api.js must stay free of domain routes");
});

test("FE-008: normalized error detail parsing is consistent across domain clients", async () => {
  const original = global.fetch;
  const errors = [];
  global.fetch = async () => new Response(JSON.stringify({ detail: "Shared detail failure" }), { status: 500 });
  try {
    for (const call of [() => sorterApi.getCollections(), () => skuImageApi.searchSkuImages("A1"), () => api.orders({})]) {
      try {
        await call();
      } catch (err) {
        errors.push(err.message);
      }
    }
  } finally {
    global.fetch = original;
  }
  assert.equal(errors.length, 3, "every domain client must reject on a 500 response");
  for (const msg of errors) {
    assert.match(msg, /Shared detail failure/, "every domain client must surface the normalized error detail");
  }
});

test("FE-008: orderMappingApi FormData upload keeps multipart headers browser-owned", async () => {
  const original = global.fetch;
  const formData = new FormData();
  let call = {};
  formData.append("file", new Blob(["sku image"]), "orders.csv");
  global.fetch = async (url, options = {}) => {
    call = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    await api.previewImport(formData.get("file"), { statusField: "status" });
  } finally {
    global.fetch = original;
  }
  assert.equal(call.url, "/api/order-mapping/imports/preview");
  assert.ok(call.options.body instanceof FormData);
  assert.equal(call.options.headers["Content-Type"], undefined, "multipart requests must not force Content-Type");
});

test("FE-008: orderMappingApi failed request normalization matches the shared transport", async () => {
  const original = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ message: "Order sync failed" }), { status: 500 });
  try {
    await assert.rejects(() => api.syncShopify({}), /Order sync failed/);
  } finally {
    global.fetch = original;
  }
});

// ===== Product Sorter preview-to-apply contract =====
// The helper is read through the namespace so this suite still loads (and the
// remaining tests still run) before the helper exists in the implementation.
function applyOrderIdsHelper() {
  return sorterApiModule.validateApplyOrderIds;
}

test("Sorter apply: serializes a generated preview to string product IDs only", async () => {
  const validateApplyOrderIds = applyOrderIdsHelper();
  assert.equal(typeof validateApplyOrderIds, "function", "validateApplyOrderIds helper must exist");

  const original = global.fetch;
  let callCount = 0;
  let captured = null;

  global.fetch = async (url, options = {}) => {
    callCount += 1;
    captured = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const preview = [
      { id: "gid://shopify/Product/101", title: "Alpha", collectionPosition: 1 },
      { id: "gid://shopify/Product/102", title: "Beta", collectionPosition: 2 },
    ];
    const orderIds = validateApplyOrderIds(preview.map((product) => product.id));
    await sorterApi.applyOrder("gid://shopify/Collection/9", orderIds, "preview-version-abc");
  } finally {
    global.fetch = original;
  }

  assert.equal(callCount, 1, "one Apply click must send exactly one request");
  assert.equal(captured.url, "/api/collections/apply");
  assert.equal(captured.options.method, "POST");
  const body = JSON.parse(captured.options.body);
  assert.equal(body.collectionId, "gid://shopify/Collection/9");
  assert.deepEqual(body.orderIds, ["gid://shopify/Product/101", "gid://shopify/Product/102"]);
  assert.equal(body.previewVersion, "preview-version-abc");
  for (const id of body.orderIds) {
    assert.equal(typeof id, "string", "every outgoing orderIds entry must be a string");
  }
  assert.ok(
    !body.orderIds.some((entry) => typeof entry === "object"),
    "no product objects may be sent inside orderIds",
  );
});

test("Sorter apply: previewVersion is omitted when absent (rollback path)", async () => {
  const validateApplyOrderIds = applyOrderIdsHelper();
  assert.equal(typeof validateApplyOrderIds, "function", "validateApplyOrderIds helper must exist");

  const original = global.fetch;
  let captured = null;
  global.fetch = async (url, options = {}) => {
    captured = { url, options };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const orderIds = validateApplyOrderIds(["gid://shopify/Product/7"]);
    await sorterApi.applyOrder("gid://shopify/Collection/9", orderIds);
  } finally {
    global.fetch = original;
  }

  const body = JSON.parse(captured.options.body);
  assert.deepEqual(body.orderIds, ["gid://shopify/Product/7"]);
  assert.ok(!("previewVersion" in body), "rollback-style applies must not carry a previewVersion");
});

test("Sorter apply: validateApplyOrderIds returns strings only and preserves preview order", () => {
  const validateApplyOrderIds = applyOrderIdsHelper();
  assert.equal(typeof validateApplyOrderIds, "function", "validateApplyOrderIds helper must exist");

  const orderIds = ["gid://shopify/Product/7", "gid://shopify/Product/8"];
  assert.deepEqual(validateApplyOrderIds(orderIds), orderIds);
});

test("Sorter apply: validateApplyOrderIds rejects an empty preview", () => {
  const validateApplyOrderIds = applyOrderIdsHelper();
  assert.equal(typeof validateApplyOrderIds, "function", "validateApplyOrderIds helper must exist");

  assert.throws(() => validateApplyOrderIds([]), /Preview is empty/);
  assert.throws(() => validateApplyOrderIds(null), /Preview is empty/);
  assert.throws(() => validateApplyOrderIds(undefined), /Preview is empty/);
});

test("Sorter apply: validateApplyOrderIds rejects non-string product identifiers", () => {
  const validateApplyOrderIds = applyOrderIdsHelper();
  assert.equal(typeof validateApplyOrderIds, "function", "validateApplyOrderIds helper must exist");

  assert.throws(() => validateApplyOrderIds(["gid://shopify/Product/1", 123]), /invalid product data/);
  assert.throws(() => validateApplyOrderIds(["gid://shopify/Product/1", ""]), /invalid product data/);
  assert.throws(() => validateApplyOrderIds(["gid://shopify/Product/1", "   "]), /invalid product data/);
});

test("Sorter apply: validateApplyOrderIds rejects malformed product GIDs", () => {
  const validateApplyOrderIds = applyOrderIdsHelper();
  assert.equal(typeof validateApplyOrderIds, "function", "validateApplyOrderIds helper must exist");

  assert.throws(() => validateApplyOrderIds(["prod_1"]), /invalid product identifier/);
  assert.throws(() => validateApplyOrderIds(["gid://shopify/Collection/1"]), /invalid product identifier/);
});

test("Sorter apply: validateApplyOrderIds rejects duplicate product IDs", () => {
  const validateApplyOrderIds = applyOrderIdsHelper();
  assert.equal(typeof validateApplyOrderIds, "function", "validateApplyOrderIds helper must exist");

  assert.throws(
    () => validateApplyOrderIds(["gid://shopify/Product/1", "gid://shopify/Product/1"]),
    /duplicate/,
  );
});
