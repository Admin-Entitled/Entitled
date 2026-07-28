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

  const hasShiprocketMatch = Boolean(
    order.shiprocket_response_id || order.shiprocket_channel_reference,
  );

  if (!hasShiprocketMatch) {
    return {
      tone: "not-found",
      label: "Not found on Shiprocket",
      detail: "Channel order ID not found",
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
