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

export function matchOrderMappingShipment({
  shiprocketResponseId,
  shiprocketOrderId,
  shopifyOrderId,
  orderNumber,
  awb,
}, rows) {
  const evidence = [
    [shopifyOrderId, ["shopify_order_id", "shopifyOrderId"], "shopify_order_id"],
    [shiprocketOrderId, ["shiprocket_order_id", "shiprocketOrderId"], "shiprocket_order_id"],
    [orderNumber, ["shiprocket_channel_reference", "shiprocketChannelReference"], "channel_order_id"],
    [orderNumber, ["shopify_order_name", "shopify_order_number"], "shopify_order_number"],
    [awb, ["awb", "shopify_tracking_number"], "awb"],
    [shiprocketResponseId, ["shiprocket_response_id", "shiprocketResponseId"], "shipment_id"],
  ];
  const matchesByEvidence = evidence
    .map(([value, fields, method]) => ({ method, rows: byField(rows, fields, value) }))
    .filter((item) => item.rows.length);

  if (!matchesByEvidence.length) {
    return { method: null, row: null, ambiguous: false, conflict: false };
  }
  if (matchesByEvidence.some((item) => item.rows.length > 1)) {
    return { method: null, row: null, ambiguous: true, conflict: true };
  }

  const distinctRows = [...new Set(matchesByEvidence.flatMap((item) => item.rows))];
  if (distinctRows.length > 1) {
    return { method: null, row: null, ambiguous: true, conflict: true };
  }

  return {
    method: matchesByEvidence[0].method,
    row: distinctRows[0],
    ambiguous: false,
    conflict: false,
  };
}
