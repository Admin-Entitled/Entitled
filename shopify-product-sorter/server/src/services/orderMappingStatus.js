const STATUS_ALIASES = [
  ["undelivered-1st attempt", "DELIVERY_ATTEMPTED"],
  ["undelivered-2nd attempt", "DELIVERY_ATTEMPTED"],
  ["undelivered-3rd attempt", "DELIVERY_ATTEMPTED"],
  ["delivery attempted", "DELIVERY_ATTEMPTED"],
  ["rto delivered", "RTO_DELIVERED"],
  ["return delivered", "RTO_DELIVERED"],
  ["successfully delivered", "DELIVERED_TO_CUSTOMER"],
  ["delivered", "DELIVERED_TO_CUSTOMER"],
  ["rto initiated", "RTO_INITIATED"],
  ["rto in transit", "RTO_IN_TRANSIT"],
  ["rto ofd", "RTO_OUT_FOR_DELIVERY"],
  ["rto out for delivery", "RTO_OUT_FOR_DELIVERY"],
  ["rto ndr", "RTO_INITIATED"],
  ["return pending", "RTO_INITIATED"],
  ["return initiated", "RTO_INITIATED"],
  ["return in-transit", "RTO_IN_TRANSIT"],
  ["return in transit", "RTO_IN_TRANSIT"],
  ["manifested", "MANIFESTED"],
  ["shipment created", "MANIFESTED"],
  ["new", "PENDING_TRACKING"],
  ["pickup pending", "PICKUP_PENDING"],
  ["pickup scheduled", "PICKUP_PENDING"],
  ["pickup exception", "SHIPMENT_EXCEPTION"],
  ["picked up", "PICKED_UP"],
  ["pickedup", "PICKED_UP"],
  ["in transit", "IN_TRANSIT"],
  ["in-transit", "IN_TRANSIT"],
  ["shipped", "IN_TRANSIT"],
  ["reached at destination", "IN_TRANSIT"],
  ["reached-at-destination", "IN_TRANSIT"],
  ["out for delivery", "OUT_FOR_DELIVERY"],
  ["ofd", "OUT_FOR_DELIVERY"],
  ["undelivered", "UNDELIVERED"],
  ["ndr", "DELIVERY_ATTEMPTED"],
  ["cancelled", "CANCELLED"],
  ["canceled", "CANCELLED"],
  ["voided", "CANCELLED"],
  ["lost", "LOST"],
  ["damaged", "DAMAGED"],
  ["destroyed", "DAMAGED"],
  ["historical courier", "HISTORICAL_COURIER"],
  ["csv required", "HISTORICAL_COURIER"],
  ["self fulfilled", "UNKNOWN"],
];

export const ORDER_MAPPING_STATUSES = [
  "PENDING_TRACKING",
  "MANIFESTED",
  "PICKUP_PENDING",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERY_ATTEMPTED",
  "UNDELIVERED",
  "DELIVERED_TO_CUSTOMER",
  "RTO_INITIATED",
  "RTO_IN_TRANSIT",
  "RTO_OUT_FOR_DELIVERY",
  "RTO_DELIVERED",
  "LOST",
  "DAMAGED",
  "CANCELLED",
  "SHIPMENT_EXCEPTION",
  "HISTORICAL_COURIER",
  "UNKNOWN",
];

const SHIPROCKET_CODE_ALIASES = {
  1: "PENDING_TRACKING",
  6: "IN_TRANSIT",
  7: "PICKUP_PENDING",
  8: "PICKUP_PENDING",
  10: "PICKED_UP",
  11: "PENDING_TRACKING",
  17: "OUT_FOR_DELIVERY",
  18: "IN_TRANSIT",
  19: "PICKUP_PENDING",
  21: "UNDELIVERED",
  38: "IN_TRANSIT",
  41: "DELIVERY_ATTEMPTED",
  42: "PICKED_UP",
  43: "RTO_INITIATED",
  46: "RTO_IN_TRANSIT",
  76: "IN_TRANSIT",
  78: "UNDELIVERED",
};

export const ACTIVE_ORDER_MAPPING_STATUSES = [
  "MANIFESTED",
  "PICKUP_PENDING",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "RTO_IN_TRANSIT",
  "RTO_OUT_FOR_DELIVERY",
];

export const ATTENTION_ORDER_MAPPING_STATUSES = [
  "PENDING_TRACKING",
  "DELIVERY_ATTEMPTED",
  "UNDELIVERED",
  "RTO_INITIATED",
  "LOST",
  "DAMAGED",
  "SHIPMENT_EXCEPTION",
  "HISTORICAL_COURIER",
  "UNKNOWN",
];

export const STATUS_SOURCES = [
  "SHOPIFY",
  "SHIPROCKET_API",
  "CSV_IMPORT",
  "MANUAL",
  "DATABASE_CACHE",
  "LEGACY_DATA",
];

export const TERMINAL_STATUSES = new Set(["DELIVERED_TO_CUSTOMER", "RTO_DELIVERED"]);

const SOURCE_PRIORITY = {
  MANUAL: 5,
  SHIPROCKET_API: 4,
  CSV_IMPORT: 3,
  DATABASE_CACHE: 2,
  SHOPIFY: 1,
  LEGACY_DATA: 0,
};

function normalizeStatusKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeOrderMappingStatus(rawStatus, fallback = "UNKNOWN") {
  const numeric = Number.parseInt(String(rawStatus || "").trim(), 10);
  if (Number.isFinite(numeric) && SHIPROCKET_CODE_ALIASES[numeric]) {
    return SHIPROCKET_CODE_ALIASES[numeric];
  }

  const normalized = normalizeStatusKey(rawStatus);
  if (!normalized) {
    return fallback;
  }

  for (const [fragment, status] of STATUS_ALIASES) {
    const normalizedFragment = normalizeStatusKey(fragment);
    if (normalized === normalizedFragment) {
      return status;
    }
  }

  for (const [fragment, status] of STATUS_ALIASES) {
    const normalizedFragment = normalizeStatusKey(fragment);
    if (normalized.includes(normalizedFragment)) {
      return status;
    }
  }

  return fallback;
}

export function isTerminalOrderMappingStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

export function displayStatusSource(shipment) {
  if (!shipment) {
    return "UNKNOWN";
  }

  if (shipment.terminal_status) {
    return "DATABASE_CACHE";
  }

  return shipment.status_source || "UNKNOWN";
}

export function canApplyStatusUpdate(current, incoming, { force = false } = {}) {
  if (!current) {
    return true;
  }

  if (incoming.source === "MANUAL" || force) {
    return true;
  }

  if (
    isTerminalOrderMappingStatus(current.normalized_status) &&
    !isTerminalOrderMappingStatus(incoming.normalizedStatus)
  ) {
    return false;
  }

  if (current.normalized_status !== "UNKNOWN" && incoming.normalizedStatus === "UNKNOWN") {
    return false;
  }

  if (current.manual_override_lock) {
    return false;
  }

  const currentAt = current.status_timestamp ? new Date(current.status_timestamp).getTime() : 0;
  const incomingAt = incoming.statusTimestamp ? new Date(incoming.statusTimestamp).getTime() : 0;

  if (incomingAt && currentAt && incomingAt < currentAt) {
    return false;
  }

  if ((SOURCE_PRIORITY[incoming.source] || 0) < (SOURCE_PRIORITY[current.status_source] || 0) && incomingAt <= currentAt) {
    return false;
  }

  return true;
}

export function statusLabel(value) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
