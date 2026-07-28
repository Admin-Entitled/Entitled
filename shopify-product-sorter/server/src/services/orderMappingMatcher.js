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

export function matchOrderMappingShipment({ shiprocketResponseId, shopifyOrderId, orderNumber, awb }, rows) {
  for (const [value, fields, method] of [
    [shiprocketResponseId, ["shiprocket_response_id"], "shiprocket_response_id"],
    [shopifyOrderId, ["shopify_order_id"], "shopify_order_id"],
    [awb, ["awb", "shopify_tracking_number"], "awb"],
    [orderNumber, ["shiprocket_channel_reference"], "shiprocket_channel_reference"],
    [orderNumber, ["shopify_order_name", "shopify_order_number"], "shopify_order_number"],
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
