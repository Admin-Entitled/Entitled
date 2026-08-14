function labelStatus(value) {
  return String(value || "")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getOrderStatusDisplay(order) {
  if (order.cancellation_status) {
    return {
      tone: "cancelled",
      label: "Cancelled",
      detail: "Cancelled in Shopify",
    };
  }

  if (order.sync_error && order.sync_error !== "NO_SHIPROCKET_RECORD") {
    return {
      tone: "attention",
      label: "Unknown / Needs attention",
      detail: order.sync_error.replaceAll("_", " "),
    };
  }

  if (order.normalized_status === "NOT_FOUND_ON_SHIPROCKET" || order.sync_error === "NO_SHIPROCKET_RECORD") {
    return {
      tone: "not-found",
      label: "Not found on Shiprocket",
      detail: "Complete Shiprocket search found no exact match",
    };
  }

  const hasShiprocketMatch = Boolean(
    order.shiprocket_response_id || order.shiprocket_channel_reference,
  );

  if (!hasShiprocketMatch) {
    return {
      tone: "attention",
      label: "Unknown / Needs attention",
      detail: "Shiprocket search has not completed for this order",
    };
  }

  if (order.normalized_status && order.normalized_status !== "UNKNOWN") {
    return {
      tone: "status",
      label: labelStatus(order.normalized_status),
      detail: order.raw_status || `Channel order ID ${order.shiprocket_channel_reference}`,
    };
  }

  if (order.raw_status) {
    return {
      tone: "status",
      label: order.raw_status,
      detail: `Channel order ID ${order.shiprocket_channel_reference}`,
    };
  }

  return {
    tone: "status",
    label: "Pending Tracking",
    detail: `Channel order ID ${order.shiprocket_channel_reference}`,
  };
}

export function getStatusFilterLabel(value) {
  return value === "ALL" ? "All Statuses" : labelStatus(value);
}

// ─── Order display helpers ───────────────────────────────────────────────────

/**
 * Email fallback chain used by order cards. Never exposes a raw value when
 * the order has no email on record.
 */
export function getEmail(order) {
  return order.customer_email || order.email || order.contact_email || "";
}

export function getOrderLabel(order) {
  return order.shopify_order_name || `#${order.shopify_order_number || order.id}`;
}

export function getSubtitle(order) {
  return order.shopify_order_number ? `Order ${order.shopify_order_number}` : "";
}

/**
 * Normalize a list-orders API payload into dashboard state slices.
 * Accepts either `globalSummary` (canonical) or the legacy `summary` shape.
 */
export function readOrdersPayload(payload) {
  const nextOrders = Array.isArray(payload.orders) ? payload.orders : [];
  const nextSummary =
    payload.globalSummary && typeof payload.globalSummary === "object"
      ? payload.globalSummary
      : payload.summary && typeof payload.summary === "object"
        ? payload.summary
        : {};
  return {
    orders: nextOrders,
    total: Number(payload.total || nextOrders.length || 0),
    statuses: ["ALL", ...Object.keys(nextSummary).filter((status) => Number(nextSummary[status] || 0) > 0)],
    page: Number(payload.page || 1),
    pageSize: Number(payload.pageSize || nextOrders.length || 0),
    deliveredAmountTotal: payload.deliveredAmountTotal || "0",
  };
}
