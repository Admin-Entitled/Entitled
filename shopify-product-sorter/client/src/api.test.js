import assert from "node:assert/strict";
import test from "node:test";

import { api } from "./orderMappingApi.js";
import { getOrderStatusDisplay, getStatusFilterLabel } from "./orderMappingView.js";
import { api as sorterApi } from "./api.js";

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
