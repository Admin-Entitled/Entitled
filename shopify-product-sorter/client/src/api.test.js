import assert from "node:assert/strict";
import test from "node:test";
import { api } from "./deliveryApi.js";

test("lists delivery orders with the selected filter", async () => {
  const original = global.fetch; let url = "";
  global.fetch = async (value) => { url = value; return new Response(JSON.stringify({ orders: [] }), { status: 200 }); };
  try { await api.orders({ filter: "UNRESOLVED", page: 2 }); } finally { global.fetch = original; }
  assert.equal(url, "/api/delivery-resolution/orders?filter=UNRESOLVED&page=2");
});
