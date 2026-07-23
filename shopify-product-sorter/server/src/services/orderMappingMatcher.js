function normalized(value) {
  return String(value || "").trim().replace(/^#/, "").trim().toUpperCase();
}

export function normalizeOrderMappingIdentifier(value) {
  return normalized(value);
}

function byField(rows, fields, value) {
  const wanted = normalized(value);
  if (!wanted) {
    return [];
  }

  return rows.filter((row) => fields.some((field) => normalized(row[field]) === wanted));
}

export function matchOrderMappingShipment({ shopifyOrderId, orderNumber, awb }, rows) {
  for (const [value, fields, method] of [
    [shopifyOrderId, ["shopify_order_id"], "shopify_order_id"],
    [orderNumber, ["shopify_order_name", "shopify_order_number"], "shopify_order_number"],
    [awb, ["awb", "shopify_tracking_number"], "awb"],
  ]) {
    const matches = byField(rows, fields, value);
    if (matches.length === 1) {
      return { method, row: matches[0] };
    }
    if (matches.length > 1) {
      return { method, row: null, ambiguous: true };
    }
  }

  return { method: null, row: null, ambiguous: false };
}
