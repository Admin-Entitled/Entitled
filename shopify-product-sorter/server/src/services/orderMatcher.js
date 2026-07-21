export function normalizeIdentifier(value) {
  return String(value || "").trim().replace(/^#/, "").trim().toUpperCase();
}

function exact(value, shipments, fields) {
  const wanted = normalizeIdentifier(value);
  if (!wanted) return [];
  return shipments.filter((shipment) => fields.some((field) => normalizeIdentifier(shipment[field]) === wanted));
}

export function findShipment(order, shipments) {
  for (const [value, fields] of [
    [order.name, ["channelOrderId", "channelOrderReference"]],
    [order.number, ["orderReference", "orderId"]],
    [order.awb, ["awb"]],
  ]) {
    const matches = exact(value, shipments, fields);
    if (matches.length === 1) return { match: matches[0], reason: "matched" };
    if (matches.length > 1) return { match: null, reason: "ambiguous" };
  }
  return { match: null, reason: "no_match" };
}
