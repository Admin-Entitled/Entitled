import assert from "node:assert/strict";
import test from "node:test";
import { api } from "./orderMappingApi.js";
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

  assert.equal(url, "/api/order-mapping/orders?status=UNDELIVERED&page=2");
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

test("fetches sorter logs from dedicated endpoints", async () => {
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
