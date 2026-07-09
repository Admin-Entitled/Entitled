import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchShiprocketOrders } from "./shiprocketService.js";
import { fetchActualSalesOrders } from "./shopifyService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../data");
const shopifyCachePath = path.join(dataDir, "sales-shopify-cache.json");
const shiprocketCachePath = path.join(dataDir, "sales-shiprocket-cache.json");
const reconciledCachePath = path.join(dataDir, "sales-reconciled-cache.json");
const ANALYTICS_SCHEMA_VERSION = 8;

const STATUS_BUCKETS = {
  DELIVERED: "DELIVERED",
  RTO: "RTO",
  RETURN: "RETURN",
  IN_TRANSIT: "IN_TRANSIT",
  NDR: "NDR",
  PICKUP_PENDING: "PICKUP_PENDING",
  CANCELLED: "CANCELLED",
  LOST_DAMAGED: "LOST_DAMAGED",
  DESTROYED: "DESTROYED",
  UNKNOWN: "UNKNOWN",
  UNMATCHED: "UNMATCHED",
};

const statusMap = {
  delivered: STATUS_BUCKETS.DELIVERED,
  "rto initiated": STATUS_BUCKETS.RTO,
  "rto-ofd": STATUS_BUCKETS.RTO,
  "rto ofd": STATUS_BUCKETS.RTO,
  "rto delivered": STATUS_BUCKETS.RTO,
  "rto acknowledged": STATUS_BUCKETS.RTO,
  "rto rejected": STATUS_BUCKETS.RTO,
  "rto-ndr": STATUS_BUCKETS.RTO,
  "rto ndr": STATUS_BUCKETS.RTO,
  "disposed of": STATUS_BUCKETS.RTO,
  destroyed: STATUS_BUCKETS.DESTROYED,
  "return pending": STATUS_BUCKETS.RETURN,
  "return initiated": STATUS_BUCKETS.RETURN,
  "return pickup generated": STATUS_BUCKETS.RETURN,
  "return pickup rescheduled": STATUS_BUCKETS.RETURN,
  "return picked up": STATUS_BUCKETS.RETURN,
  "return pickup error": STATUS_BUCKETS.RETURN,
  "return in-transit": STATUS_BUCKETS.RETURN,
  "return delivered": STATUS_BUCKETS.RETURN,
  "return canceled": STATUS_BUCKETS.RETURN,
  undelivered: STATUS_BUCKETS.NDR,
  ndr: STATUS_BUCKETS.NDR,
  escalation: STATUS_BUCKETS.NDR,
  "re-escalation": STATUS_BUCKETS.NDR,
  pickedup: STATUS_BUCKETS.IN_TRANSIT,
  "picked up": STATUS_BUCKETS.IN_TRANSIT,
  shipped: STATUS_BUCKETS.IN_TRANSIT,
  "in-transit": STATUS_BUCKETS.IN_TRANSIT,
  "in transit": STATUS_BUCKETS.IN_TRANSIT,
  "reached-at-destination hub": STATUS_BUCKETS.IN_TRANSIT,
  "reached at destination hub": STATUS_BUCKETS.IN_TRANSIT,
  "out for delivery": STATUS_BUCKETS.IN_TRANSIT,
  delayed: STATUS_BUCKETS.IN_TRANSIT,
  misrouted: STATUS_BUCKETS.IN_TRANSIT,
  "pickup scheduled": STATUS_BUCKETS.PICKUP_PENDING,
  "pickup error": STATUS_BUCKETS.PICKUP_PENDING,
  "pickup exception": STATUS_BUCKETS.PICKUP_PENDING,
  "pickup rescheduled": STATUS_BUCKETS.PICKUP_PENDING,
  "out for pickup": STATUS_BUCKETS.PICKUP_PENDING,
  canceled: STATUS_BUCKETS.CANCELLED,
  cancelled: STATUS_BUCKETS.CANCELLED,
  lost: STATUS_BUCKETS.LOST_DAMAGED,
  damaged: STATUS_BUCKETS.LOST_DAMAGED,
};

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, payload) {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function normalizeOrderRef(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^#/, "")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_-]/g, "");
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function money(value) {
  return Number(value || 0);
}

function sumLineValues(lineItems, field) {
  return lineItems.reduce((sum, lineItem) => sum + Number(lineItem[field] || 0), 0);
}

function daysBetween(start, end = Date.now()) {
  if (!start) {
    return 0;
  }
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60 * 24));
}

const COLOR_PREFIXES = [
  "old navy",
  "navy blue",
  "light blue",
  "dark blue",
  "off white",
  "olive green",
  "forest green",
  "sky blue",
  "royal blue",
  "black",
  "white",
  "grey",
  "gray",
  "blue",
  "green",
  "red",
  "pink",
  "brown",
  "beige",
  "tan",
  "yellow",
  "cream",
];

function inferColor(lineItem) {
  const source = `${lineItem.productTitle || ""} ${lineItem.variantTitle || ""}`.trim().toLowerCase();
  for (const color of COLOR_PREFIXES) {
    if (source.includes(color)) {
      return color.replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }
  return "Unknown";
}

function inferSize(lineItem) {
  const value = String(lineItem.variantTitle || "").trim();
  if (!value || value.toLowerCase() === "default title") {
    return "Unknown";
  }
  return value.split("/").map((part) => part.trim()).filter(Boolean).pop() || value;
}

function inferType(lineItem) {
  if (lineItem.productType?.trim()) {
    return lineItem.productType.trim();
  }
  const title = String(lineItem.productTitle || lineItem.title || "").trim();
  return title.split("|").map((part) => part.trim()).filter(Boolean)[1] || title || "Unknown";
}

function recommendationForMetrics(row) {
  const deliveredVelocity = Number(row.salesVelocity || 0);
  const daysOfCover = Number(row.daysOfCover || 0);
  const rtoRate = Number(row.rtoRate || 0);
  const returnRate = Number(row.returnRate || 0);
  const inventory = Number(row.currentInventory || 0);

  if ((rtoRate >= 0.35 || returnRate >= 0.2) && row.deliveredUnits <= row.bookedUnits * 0.5) {
    return "Avoid / Stop Buying";
  }
  if (deliveredVelocity > 0.3 && daysOfCover <= 10 && rtoRate <= 0.2 && returnRate <= 0.15) {
    return "Buy More";
  }
  if (inventory > 0 && deliveredVelocity > 0.15 && rtoRate <= 0.2) {
    return "Focus More";
  }
  if (daysOfCover >= 45 || rtoRate >= 0.25) {
    return "Buy Less";
  }
  return "Watch";
}

function buildRestockSuggestion(row) {
  const targetCoverDays = 21;
  const suggestedRestockQty = Math.max(
    0,
    Math.ceil((Number(row.salesVelocity || 0) * targetCoverDays) - Number(row.currentInventory || 0)),
  );
  const adjustedRestockQty = Math.max(
    0,
    Math.ceil(suggestedRestockQty * (1 - Math.min(Number(row.rtoRate || 0), 0.5))),
  );
  return {
    targetCoverDays,
    suggestedRestockQty,
    adjustedRestockQty,
    reason:
      adjustedRestockQty > 0
        ? "Delivered velocity supports replenishment; quantity is reduced by current RTO rate."
        : "Current inventory already covers delivered velocity or RTO-adjustment removes the need.",
  };
}

function inferPaymentMethod(order) {
  const gateways = Array.isArray(order.paymentGatewayNames) ? order.paymentGatewayNames : [];
  const normalized = gateways.join(" ").toLowerCase();
  if (normalized.includes("cash") || normalized.includes("cod")) {
    return "COD";
  }
  return gateways.length ? "Prepaid" : "Unknown";
}

function buildAggregateRow(label) {
  return {
    label,
    bookedUnits: 0,
    deliveredUnits: 0,
    deliveredSales: 0,
    pendingUnits: 0,
    pendingSales: 0,
    rtoUnits: 0,
    rtoSales: 0,
    returnUnits: 0,
    returnSales: 0,
    refundedAmount: 0,
    bookedSales: 0,
    currentInventory: 0,
    awbCount: 0,
    orderIds: new Set(),
    courierCounts: new Map(),
    deliveredDays: [],
  };
}

function finalizeAggregateRows(rows, days) {
  return rows.map((row) => {
    const deliveredOrderCount = row.deliveredDays.length || 0;
    const salesVelocity = days > 0 ? row.deliveredUnits / days : 0;
    const daysOfCover = salesVelocity > 0 ? row.currentInventory / salesVelocity : 999;
    const sellThroughBase = row.deliveredUnits + Math.max(0, row.currentInventory);
    const topCourierEntry = [...row.courierCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    const plain = {
      label: row.label,
      bookedUnits: row.bookedUnits,
      bookedSales: row.bookedSales,
      deliveredUnits: row.deliveredUnits,
      deliveredSales: row.deliveredSales,
      pendingUnits: row.pendingUnits,
      pendingSales: row.pendingSales,
      rtoUnits: row.rtoUnits,
      rtoSales: row.rtoSales,
      rtoRate: row.bookedUnits > 0 ? row.rtoUnits / row.bookedUnits : 0,
      returnUnits: row.returnUnits,
      returnSales: row.returnSales,
      returnRate: row.deliveredUnits > 0 ? row.returnUnits / row.deliveredUnits : 0,
      trueNetSales: row.deliveredSales - row.returnSales - row.refundedAmount,
      currentInventory: row.currentInventory,
      sellThroughRate: sellThroughBase > 0 ? row.deliveredUnits / sellThroughBase : 0,
      salesVelocity,
      daysOfCover,
      awbCount: row.awbCount,
      courierSplit: topCourierEntry ? `${topCourierEntry[0]} (${topCourierEntry[1]})` : "-",
      deliveredOrderCount,
    };
    return {
      ...plain,
      recommendation: recommendationForMetrics(plain),
    };
  }).sort((left, right) => right.deliveredSales - left.deliveredSales || right.deliveredUnits - left.deliveredUnits);
}

function csvEscape(value) {
  const stringValue = String(value ?? "");
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function toCsv(rows) {
  if (!rows.length) {
    return "";
  }
  const headers = Object.keys(rows[0]);
  return [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

function exportRowsForReconciledOrders(reconciledOrders) {
  return reconciledOrders.map((order) => ({
    shopifyOrderName: order.shopifyOrderName,
    processedAt: order.processedAt,
    total: order.total,
    refundedAmount: order.refundedAmount,
    shipmentBucket: order.shipmentBucket,
    shiprocketStatus: order.shiprocketStatus,
    courierName: order.courierName,
    awb: order.awb,
    matchType: order.matchType,
    matchConfidence: order.matchConfidence,
    pincode: order.shippingAddress?.zip || "",
    city: order.shippingAddress?.city || "",
    state: order.shippingAddress?.province || "",
  }));
}

function exportRowsForNormalizedShopifyOrders(orders) {
  return (orders || []).map((order) => ({
    shopifyOrderId: order.id,
    shopifyOrderName: order.name,
    createdAt: order.createdAt,
    processedAt: order.processedAt,
    cancelledAt: order.cancelledAt || "",
    paymentMethod: inferPaymentMethod(order),
    paymentGatewayNames: (order.paymentGatewayNames || []).join(" | "),
    financialStatus: order.financialStatus,
    fulfillmentStatus: order.fulfillmentStatus,
    total: order.total,
    refundedAmount: order.refundedAmount,
    bookedUnits: order.bookedUnits,
    phone: order.phone || "",
    pincode: order.shippingAddress?.zip || "",
    city: order.shippingAddress?.city || "",
    state: order.shippingAddress?.province || "",
    trackingNumbers: (order.trackingNumbers || []).join(" | "),
  }));
}

function exportRowsForNormalizedShiprocketOrders(orders) {
  return (orders || []).flatMap((order) => {
    const shipments = Array.isArray(order.shipments) && order.shipments.length ? order.shipments : [null];
    return shipments.map((shipment) => ({
      shiprocketOrderId: order.id,
      channelOrderId: order.channel_order_id || "",
      status: order.status || "",
      paymentMethod: order.payment_method || "",
      total: money(order.total),
      customerPhone: order.customer_phone || "",
      customerName: order.customer_name || "",
      courierName: shipment?.courier || "",
      awb: shipment?.awb || "",
      deliveredDate: shipment?.delivered_date || "",
      rtoDeliveredDate: shipment?.rto_delivered_date || "",
      dimensions: shipment?.dimensions || "",
      weight: shipment?.weight || "",
      pickupLocation: order.pickup_location || "",
    }));
  });
}

function exportRowsForReconciliationIssues(issues = {}) {
  const groups = [
    ["low_confidence_match", issues.lowConfidenceMatches || []],
    ["unmatched_shopify_order", issues.unmatchedShopifyOrders || []],
    ["missing_awb", issues.missingAwb || []],
    ["missing_sku", issues.missingSku || []],
    ["missing_shipment_status", issues.missingShipmentStatus || []],
  ];

  return groups.flatMap(([issueType, rows]) =>
    rows.map((row) => ({
      issueType,
      ...row,
    })),
  );
}

function buildAnalytics(reconciledOrders, days) {
  const brands = new Map();
  const types = new Map();
  const colors = new Map();
  const skus = new Map();
  const couriers = new Map();
  const pincodes = new Map();
  const states = new Map();
  const cities = new Map();
  const recommendations = [];
  const pendingRisk = [];
  const paymentPerformance = new Map();
  const reconciliationIssues = {
    lowConfidenceMatches: [],
    unmatchedShopifyOrders: [],
    missingAwb: [],
    missingSku: [],
    missingShipmentStatus: [],
  };
  const rtoBuckets = {
    byBrand: new Map(),
    byType: new Map(),
    byColor: new Map(),
    bySku: new Map(),
    byCourier: new Map(),
    byPincode: new Map(),
  };

  for (const order of reconciledOrders) {
    if (["low", "medium"].includes(order.matchConfidence)) {
      reconciliationIssues.lowConfidenceMatches.push({
        shopifyOrderName: order.shopifyOrderName,
        matchType: order.matchType,
        matchConfidence: order.matchConfidence,
        shiprocketStatus: order.shiprocketStatus,
      });
    }
    if (order.shipmentBucket === "UNMATCHED") {
      reconciliationIssues.unmatchedShopifyOrders.push({
        shopifyOrderName: order.shopifyOrderName,
        total: order.total,
        processedAt: order.processedAt,
      });
    }
    if (!order.awb) {
      reconciliationIssues.missingAwb.push({
        shopifyOrderName: order.shopifyOrderName,
        shipmentBucket: order.shipmentBucket,
        shiprocketStatus: order.shiprocketStatus,
      });
    }
    if (!order.shiprocketStatus || order.shiprocketStatus === "Unmatched / Needs Review") {
      reconciliationIssues.missingShipmentStatus.push({
        shopifyOrderName: order.shopifyOrderName,
        shipmentBucket: order.shipmentBucket,
      });
    }

    const orderAgeDays = daysBetween(order.processedAt || order.createdAt);
    const paymentMethod = order.paymentMethod || "Unknown";

    if (!paymentPerformance.has(paymentMethod)) {
      paymentPerformance.set(paymentMethod, {
        paymentMethod,
        orders: 0,
        deliveredOrders: 0,
        pendingOrders: 0,
        rtoOrders: 0,
        returnOrders: 0,
        sales: 0,
        deliveredSales: 0,
        rtoSales: 0,
      });
    }
    const paymentRow = paymentPerformance.get(paymentMethod);
    paymentRow.orders += 1;
    paymentRow.sales += money(order.total);
    if (order.shipmentBucket === "DELIVERED") {
      paymentRow.deliveredOrders += 1;
      paymentRow.deliveredSales += money(order.total);
    } else if (["PICKUP_PENDING", "IN_TRANSIT", "NDR", "UNKNOWN"].includes(order.shipmentBucket)) {
      paymentRow.pendingOrders += 1;
    } else if (["RTO", "LOST_DAMAGED", "DESTROYED"].includes(order.shipmentBucket)) {
      paymentRow.rtoOrders += 1;
      paymentRow.rtoSales += money(order.total);
    } else if (order.shipmentBucket === "RETURN") {
      paymentRow.returnOrders += 1;
    }

    if (["PICKUP_PENDING", "IN_TRANSIT", "NDR"].includes(order.shipmentBucket)) {
      let riskLevel = "Low";
      if (order.shipmentBucket === "NDR") {
        riskLevel = "High";
      } else if (String(order.shiprocketStatus || "").toLowerCase().includes("misrouted")) {
        riskLevel = "High";
      } else if (String(order.shiprocketStatus || "").toLowerCase().includes("delayed") || orderAgeDays > 7) {
        riskLevel = "Medium";
      }
      pendingRisk.push({
        order: order.shopifyOrderName,
        awb: order.awb || "-",
        courier: order.courierName || "-",
        status: order.shiprocketStatus,
        bucket: order.shipmentBucket,
        daysSinceOrder: Math.round(orderAgeDays),
        orderValue: order.total,
        pincode: order.shippingAddress?.zip || "-",
        riskLevel,
        suggestedAction: riskLevel === "High" ? "Investigate courier / call customer" : "Monitor",
      });
    }

    if (order.courierName) {
      if (!couriers.has(order.courierName)) {
        couriers.set(order.courierName, {
          courier: order.courierName,
          totalShipments: 0,
          deliveredShipments: 0,
          rtoShipments: 0,
          pendingShipments: 0,
          ndrShipments: 0,
          lostDamaged: 0,
          deliveredDays: [],
        });
      }
      const courier = couriers.get(order.courierName);
      courier.totalShipments += 1;
      if (order.shipmentBucket === "DELIVERED") {
        courier.deliveredShipments += 1;
        courier.deliveredDays.push(daysBetween(order.processedAt || order.createdAt, order.deliveredDate || Date.now()));
      } else if (order.shipmentBucket === "RTO") {
        courier.rtoShipments += 1;
      } else if (order.shipmentBucket === "NDR") {
        courier.ndrShipments += 1;
        courier.pendingShipments += 1;
      } else if (["PICKUP_PENDING", "IN_TRANSIT", "UNKNOWN"].includes(order.shipmentBucket)) {
        courier.pendingShipments += 1;
      } else if (["LOST_DAMAGED", "DESTROYED"].includes(order.shipmentBucket)) {
        courier.lostDamaged += 1;
      }
    }

    const pincode = order.shippingAddress?.zip || "Unknown";
    const state = order.shippingAddress?.province || "Unknown";
    const city = order.shippingAddress?.city || "Unknown";
    if (!pincodes.has(pincode)) {
      pincodes.set(pincode, {
        pincode,
        state,
        city,
        orders: 0,
        delivered: 0,
        rto: 0,
        pending: 0,
        deliveredSales: 0,
        pendingSales: 0,
        rtoSales: 0,
        courierCounts: new Map(),
        brandCounts: new Map(),
        typeCounts: new Map(),
      });
    }
    const pincodeRow = pincodes.get(pincode);
    pincodeRow.orders += 1;
    if (order.courierName) {
      pincodeRow.courierCounts.set(order.courierName, (pincodeRow.courierCounts.get(order.courierName) || 0) + 1);
    }
    if (order.shipmentBucket === "DELIVERED") {
      pincodeRow.delivered += 1;
      pincodeRow.deliveredSales += money(order.total);
    } else if (["PICKUP_PENDING", "IN_TRANSIT", "NDR", "UNKNOWN"].includes(order.shipmentBucket)) {
      pincodeRow.pending += 1;
      pincodeRow.pendingSales += money(order.total);
    } else if (["RTO", "LOST_DAMAGED", "DESTROYED"].includes(order.shipmentBucket)) {
      pincodeRow.rto += 1;
      pincodeRow.rtoSales += money(order.total);
    }

    for (const [map, key, labelField] of [
      [states, state, "state"],
      [cities, `${state}__${city}`, "city"],
    ]) {
      if (!map.has(key)) {
        map.set(key, {
          [labelField]: labelField === "state" ? state : city,
          state,
          city,
          orders: 0,
          delivered: 0,
          rto: 0,
          pending: 0,
          deliveredSales: 0,
          courierCounts: new Map(),
        });
      }
      const geoRow = map.get(key);
      geoRow.orders += 1;
      if (order.courierName) {
        geoRow.courierCounts.set(order.courierName, (geoRow.courierCounts.get(order.courierName) || 0) + 1);
      }
      if (order.shipmentBucket === "DELIVERED") {
        geoRow.delivered += 1;
        geoRow.deliveredSales += money(order.total);
      } else if (["PICKUP_PENDING", "IN_TRANSIT", "NDR", "UNKNOWN"].includes(order.shipmentBucket)) {
        geoRow.pending += 1;
      } else if (["RTO", "LOST_DAMAGED", "DESTROYED"].includes(order.shipmentBucket)) {
        geoRow.rto += 1;
      }
    }

    for (const lineItem of order.lineItems || []) {
      if (!lineItem.sku) {
        reconciliationIssues.missingSku.push({
          shopifyOrderName: order.shopifyOrderName,
          productTitle: lineItem.productTitle || lineItem.title || "Unknown",
        });
      }
      const units = Math.max(0, Number(lineItem.currentQuantity || 0));
      const bookedUnits = Math.max(0, Number(lineItem.quantity || 0));
      const lineSales = money(lineItem.lineRevenue);
      const brand = lineItem.vendor || "Unknown";
      const type = inferType(lineItem);
      const color = inferColor(lineItem);
      const sku = lineItem.sku || `NO-SKU:${lineItem.title}`;
      const inventory = Math.max(Number(lineItem.totalInventory || lineItem.inventoryQuantity || 0), 0);
      pincodeRow.brandCounts.set(brand, (pincodeRow.brandCounts.get(brand) || 0) + units);
      pincodeRow.typeCounts.set(type, (pincodeRow.typeCounts.get(type) || 0) + units);
      const dimensionValues = [
        [brands, brand],
        [types, type],
        [colors, color],
        [skus, sku],
      ];

      for (const [dimensionMap, key] of dimensionValues) {
        if (!dimensionMap.has(key)) {
          dimensionMap.set(key, buildAggregateRow(key));
        }
        const row = dimensionMap.get(key);
        row.bookedUnits += bookedUnits;
        row.bookedSales += lineSales;
        row.currentInventory = Math.max(row.currentInventory, inventory);
        if (order.awb) {
          row.awbCount += 1;
        }
        row.orderIds.add(order.shopifyOrderId);
        if (order.courierName) {
          row.courierCounts.set(order.courierName, (row.courierCounts.get(order.courierName) || 0) + 1);
        }

        if (order.shipmentBucket === "DELIVERED") {
          row.deliveredUnits += units;
          row.deliveredSales += lineSales;
          row.deliveredDays.push(order.processedAt || order.createdAt);
        } else if (["PICKUP_PENDING", "IN_TRANSIT", "NDR", "UNKNOWN"].includes(order.shipmentBucket)) {
          row.pendingUnits += units;
          row.pendingSales += lineSales;
        } else if (["RTO", "LOST_DAMAGED", "DESTROYED"].includes(order.shipmentBucket)) {
          row.rtoUnits += units;
          row.rtoSales += lineSales;
        } else if (order.shipmentBucket === "RETURN") {
          row.returnUnits += units;
          row.returnSales += lineSales;
        }

        row.refundedAmount += money(order.refundedAmount || 0) / Math.max(1, (order.lineItems || []).length);
      }

      if (["RTO", "LOST_DAMAGED", "DESTROYED"].includes(order.shipmentBucket)) {
        const rtoMappings = [
          [rtoBuckets.byBrand, brand],
          [rtoBuckets.byType, type],
          [rtoBuckets.byColor, color],
          [rtoBuckets.bySku, sku],
          [rtoBuckets.byCourier, order.courierName || "Unknown"],
          [rtoBuckets.byPincode, order.shippingAddress?.zip || "Unknown"],
        ];
        for (const [map, key] of rtoMappings) {
          map.set(key, (map.get(key) || 0) + units);
        }
      }
    }
  }

  const brandPerformance = finalizeAggregateRows([...brands.values()], days);
  const typePerformance = finalizeAggregateRows([...types.values()], days);
  const colorPerformance = finalizeAggregateRows([...colors.values()], days);
  const skuPerformance = finalizeAggregateRows([...skus.values()], days).map((row) => {
    const sourceOrder = reconciledOrders.flatMap((order) => order.lineItems.map((lineItem) => ({ order, lineItem })))
      .find((entry) => (entry.lineItem.sku || `NO-SKU:${entry.lineItem.title}`) === row.label);
    return {
      ...row,
      sku: row.label,
      productTitle: sourceOrder?.lineItem.productTitle || sourceOrder?.lineItem.title || row.label,
      brand: sourceOrder?.lineItem.vendor || "Unknown",
      type: sourceOrder ? inferType(sourceOrder.lineItem) : "Unknown",
      color: sourceOrder ? inferColor(sourceOrder.lineItem) : "Unknown",
      size: sourceOrder ? inferSize(sourceOrder.lineItem) : "Unknown",
    };
  });

  for (const row of skuPerformance.slice(0, 20)) {
    if (row.recommendation === "Buy More" || row.recommendation === "Avoid / Stop Buying" || row.recommendation === "Buy Less") {
      recommendations.push({
        sku: row.sku,
        productTitle: row.productTitle,
        recommendation: row.recommendation,
        reason:
          row.recommendation === "Buy More"
            ? "Delivered velocity is healthy, days of cover is low, and RTO/returns are under control."
            : row.recommendation === "Avoid / Stop Buying"
              ? "Delivered conversion is weak relative to booked demand and loss rates are too high."
              : "Coverage is high or RTO is elevated, so buying should be reduced.",
      });
    }
  }

  const courierPerformance = [...couriers.values()]
    .map((row) => ({
      courier: row.courier,
      totalShipments: row.totalShipments,
      deliveredShipments: row.deliveredShipments,
      rtoShipments: row.rtoShipments,
      pendingShipments: row.pendingShipments,
      ndrShipments: row.ndrShipments,
      lostDamaged: row.lostDamaged,
      deliverySuccessRate: row.totalShipments > 0 ? row.deliveredShipments / row.totalShipments : 0,
      rtoRate: row.totalShipments > 0 ? row.rtoShipments / row.totalShipments : 0,
      averageDeliveryDays: row.deliveredDays.length
        ? row.deliveredDays.reduce((sum, value) => sum + value, 0) / row.deliveredDays.length
        : 0,
      recommendation: row.rtoShipments > row.deliveredShipments ? "Review courier allocation" : "Healthy",
    }))
    .sort((left, right) => right.totalShipments - left.totalShipments);

  const pincodePerformance = [...pincodes.values()]
    .map((row) => {
      const topCourierEntry = [...row.courierCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const topBrandEntry = [...row.brandCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const topTypeEntry = [...row.typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        pincode: row.pincode,
        state: row.state,
        city: row.city,
        orders: row.orders,
        delivered: row.delivered,
        rto: row.rto,
        pending: row.pending,
        deliveredSales: row.deliveredSales,
        rtoRate: row.orders > 0 ? row.rto / row.orders : 0,
        courierSplit: topCourierEntry ? `${topCourierEntry[0]} (${topCourierEntry[1]})` : "-",
        topBrand: topBrandEntry ? topBrandEntry[0] : "Unknown",
        topType: topTypeEntry ? topTypeEntry[0] : "Unknown",
        recommendation: row.rto / Math.max(1, row.orders) >= 0.3 ? "Review COD / courier rules" : "Healthy",
      };
    })
    .sort((left, right) => right.orders - left.orders);

  const summarizeGeo = (rows, labelKey) =>
    [...rows.values()]
      .map((row) => {
        const topCourierEntry = [...row.courierCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        return {
          [labelKey]: row[labelKey],
          state: row.state,
          city: row.city,
          orders: row.orders,
          delivered: row.delivered,
          pending: row.pending,
          rto: row.rto,
          deliveredSales: row.deliveredSales,
          rtoRate: row.orders > 0 ? row.rto / row.orders : 0,
          courierSplit: topCourierEntry ? `${topCourierEntry[0]} (${topCourierEntry[1]})` : "-",
        };
      })
      .sort((left, right) => right.orders - left.orders);

  const statePerformance = summarizeGeo(states, "state").slice(0, 25);
  const cityPerformance = summarizeGeo(cities, "city").slice(0, 25);

  const paymentMethodPerformance = [...paymentPerformance.values()]
    .map((row) => ({
      ...row,
      deliverySuccessRate: row.orders > 0 ? row.deliveredOrders / row.orders : 0,
      rtoRate: row.orders > 0 ? row.rtoOrders / row.orders : 0,
    }))
    .sort((left, right) => right.orders - left.orders);

  const restockSuggestions = skuPerformance
    .map((row) => ({
      ...row,
      ...buildRestockSuggestion(row),
    }))
    .filter((row) => row.adjustedRestockQty > 0 || row.recommendation === "Buy More")
    .sort((left, right) => right.adjustedRestockQty - left.adjustedRestockQty || right.deliveredUnits - left.deliveredUnits)
    .slice(0, 25);

  const topEntries = (map) =>
    [...map.entries()]
      .map(([label, units]) => ({ label, rtoUnits: units }))
      .sort((left, right) => right.rtoUnits - left.rtoUnits)
      .slice(0, 15);

  const rtoAnalysis = {
    rtoOrders: reconciledOrders.filter((order) => ["RTO", "LOST_DAMAGED", "DESTROYED"].includes(order.shipmentBucket)).length,
    rtoUnits: skuPerformance.reduce((sum, row) => sum + Number(row.rtoUnits || 0), 0),
    rtoSalesValue: skuPerformance.reduce((sum, row) => sum + Number(row.rtoSales || 0), 0),
    byBrand: topEntries(rtoBuckets.byBrand),
    byType: topEntries(rtoBuckets.byType),
    byColor: topEntries(rtoBuckets.byColor),
    bySku: topEntries(rtoBuckets.bySku),
    byCourier: topEntries(rtoBuckets.byCourier),
    byPincode: topEntries(rtoBuckets.byPincode),
  };

  return {
    formalSummary: buildFormalSummary({
      reconciledOrders,
      brandPerformance,
      recommendations,
    }),
    recommendations,
    pendingRisk: pendingRisk.sort((left, right) => right.daysSinceOrder - left.daysSinceOrder).slice(0, 30),
    brandPerformance: brandPerformance.slice(0, 25),
    typePerformance: typePerformance.slice(0, 25),
    colorPerformance: colorPerformance.slice(0, 25),
    skuPerformance: skuPerformance.slice(0, 50),
    courierPerformance: courierPerformance.slice(0, 20),
    pincodePerformance: pincodePerformance.slice(0, 25),
    statePerformance,
    cityPerformance,
    paymentMethodPerformance,
    rtoAnalysis,
    restockSuggestions,
    reconciliationIssues: {
      lowConfidenceMatches: reconciliationIssues.lowConfidenceMatches.slice(0, 50),
      unmatchedShopifyOrders: reconciliationIssues.unmatchedShopifyOrders.slice(0, 50),
      missingAwb: reconciliationIssues.missingAwb.slice(0, 50),
      missingSku: reconciliationIssues.missingSku.slice(0, 50),
      missingShipmentStatus: reconciliationIssues.missingShipmentStatus.slice(0, 50),
      summary: {
        lowConfidenceMatches: reconciliationIssues.lowConfidenceMatches.length,
        unmatchedShopifyOrders: reconciliationIssues.unmatchedShopifyOrders.length,
        missingAwb: reconciliationIssues.missingAwb.length,
        missingSku: reconciliationIssues.missingSku.length,
        missingShipmentStatus: reconciliationIssues.missingShipmentStatus.length,
      },
    },
  };
}

function buildFormalSummary({ reconciledOrders, brandPerformance, recommendations }) {
  const bookedSales = reconciledOrders.reduce((sum, order) => sum + money(order.total), 0);
  const deliveredSales = reconciledOrders
    .filter((order) => order.shipmentBucket === "DELIVERED")
    .reduce((sum, order) => sum + money(order.total), 0);
  const pendingSales = reconciledOrders
    .filter((order) => ["PICKUP_PENDING", "IN_TRANSIT", "NDR", "UNKNOWN"].includes(order.shipmentBucket))
    .reduce((sum, order) => sum + money(order.total), 0);
  const rtoSales = reconciledOrders
    .filter((order) => ["RTO", "LOST_DAMAGED", "DESTROYED"].includes(order.shipmentBucket))
    .reduce((sum, order) => sum + money(order.total), 0);
  const topBrand = brandPerformance[0]?.label || "Unknown";
  const buyMore = recommendations.filter((item) => item.recommendation === "Buy More").slice(0, 3).map((item) => item.sku);
  const buyLess = recommendations.filter((item) => item.recommendation !== "Buy More").slice(0, 3).map((item) => item.sku);

  return [
    `Shopify booked ${Math.round(bookedSales)} across ${reconciledOrders.length} orders in the selected period.`,
    `After Shiprocket reconciliation, ${Math.round(deliveredSales)} is delivered, ${Math.round(pendingSales)} is still pending, and ${Math.round(rtoSales)} is in RTO/loss buckets.`,
    `Top delivered brand is ${topBrand}. Buy more watchlist: ${buyMore.join(", ") || "none"}. Buy less watchlist: ${buyLess.join(", ") || "none"}.`,
  ].join(" ");
}

function classifyShiprocketStatus(order) {
  const rawStatus = String(order?.status || "").trim();
  const normalized = rawStatus.toLowerCase();
  if (statusMap[normalized]) {
    return statusMap[normalized];
  }

  for (const [key, bucket] of Object.entries(statusMap)) {
    if (normalized.includes(key)) {
      return bucket;
    }
  }

  return STATUS_BUCKETS.UNKNOWN;
}

function isCancelledShopifyOrder(order) {
  return Boolean(order.cancelledAt) || String(order.financialStatus || "").toLowerCase() === "voided";
}

function inferMatchConfidence(shopifyOrder, shiprocketOrder, matchType) {
  if (!shiprocketOrder) {
    return "none";
  }
  if (matchType === "order_name" || matchType === "awb") {
    return "high";
  }
  if (matchType === "phone_amount_date") {
    return "medium";
  }
  return "low";
}

function buildOrderIndexes(shiprocketOrders) {
  const byOrderRef = new Map();
  const byAwb = new Map();
  const byPhoneAmountDate = new Map();

  for (const order of shiprocketOrders) {
    const orderRef = normalizeOrderRef(order.channel_order_id || order.order_id);
    if (orderRef && !byOrderRef.has(orderRef)) {
      byOrderRef.set(orderRef, order);
    }

    for (const shipment of order.shipments || []) {
      const awb = String(shipment.awb || "").trim();
      if (awb && !byAwb.has(awb)) {
        byAwb.set(awb, order);
      }
    }

    const phone = normalizePhone(order.customer_phone);
    const amount = money(order.total).toFixed(2);
    const date = String(order.channel_created_at || order.created_at || "").slice(0, 11).trim();
    const fallbackKey = `${phone}|${amount}|${date}`;
    if (phone && !byPhoneAmountDate.has(fallbackKey)) {
      byPhoneAmountDate.set(fallbackKey, order);
    }
  }

  return { byOrderRef, byAwb, byPhoneAmountDate };
}

function matchShiprocketOrder(shopifyOrder, indexes) {
  const orderRef = normalizeOrderRef(shopifyOrder.name);
  if (orderRef && indexes.byOrderRef.has(orderRef)) {
    return { order: indexes.byOrderRef.get(orderRef), matchType: "order_name" };
  }

  for (const trackingNumber of shopifyOrder.trackingNumbers || []) {
    if (indexes.byAwb.has(trackingNumber)) {
      return { order: indexes.byAwb.get(trackingNumber), matchType: "awb" };
    }
  }

  const fallbackKey = `${normalizePhone(shopifyOrder.phone)}|${money(shopifyOrder.total).toFixed(2)}|${String(shopifyOrder.processedAt || shopifyOrder.createdAt).slice(0, 11).trim()}`;
  if (normalizePhone(shopifyOrder.phone) && indexes.byPhoneAmountDate.has(fallbackKey)) {
    return { order: indexes.byPhoneAmountDate.get(fallbackKey), matchType: "phone_amount_date" };
  }

  return { order: null, matchType: null };
}

function buildMetric(label) {
  return {
    label,
    orders: 0,
    units: 0,
    sales: 0,
  };
}

function incrementMetric(metric, orderCount, units, sales) {
  metric.orders += orderCount;
  metric.units += units;
  metric.sales += sales;
}

export async function refreshShopifySalesData({ days = 30 } = {}) {
  const safeDays = Math.max(1, Math.min(Number(days) || 30, 365));
  const orders = await fetchActualSalesOrders(safeDays);
  const payload = {
    source: "shopify",
    days: safeDays,
    refreshedAt: new Date().toISOString(),
    orders,
  };
  writeJson(shopifyCachePath, payload);
  return payload;
}

export async function refreshShiprocketSalesData({ days = 30 } = {}) {
  const payload = await fetchShiprocketOrders({ days });
  const result = {
    source: "shiprocket",
    days: payload.days,
    refreshedAt: new Date().toISOString(),
    configured: payload.configured,
    orders: payload.orders,
  };
  writeJson(shiprocketCachePath, result);
  return result;
}

function getCachedSource(cachePath) {
  return readJson(cachePath);
}

export async function reconcileSalesData({ days = 30, forceRefresh = false } = {}) {
  const safeDays = Math.max(1, Math.min(Number(days) || 30, 365));
  const shopifyCache = forceRefresh
    ? await refreshShopifySalesData({ days: safeDays })
    : (getCachedSource(shopifyCachePath) || await refreshShopifySalesData({ days: safeDays }));
  const warnings = [];
  let shiprocketCache;

  try {
    shiprocketCache = forceRefresh
      ? await refreshShiprocketSalesData({ days: Math.min(safeDays, 30) })
      : (getCachedSource(shiprocketCachePath) || await refreshShiprocketSalesData({ days: Math.min(safeDays, 30) }));
  } catch (error) {
    shiprocketCache = getCachedSource(shiprocketCachePath) || {
      source: "shiprocket",
      days: Math.min(safeDays, 30),
      refreshedAt: null,
      configured: false,
      orders: [],
    };
    warnings.push(`Shiprocket refresh failed: ${error.message}`);
  }

  const indexes = buildOrderIndexes(shiprocketCache.orders || []);
  const shiprocketMatchedIds = new Set();
  const metrics = {
    shopifyBooked: buildMetric("Shopify Booked"),
    delivered: buildMetric("Actual Delivered"),
    pending: buildMetric("Pending"),
    rto: buildMetric("RTO"),
    returns: buildMetric("Returns"),
    cancelled: buildMetric("Cancelled"),
    unmatched: buildMetric("Unmatched"),
  };

  const reconciledOrders = (shopifyCache.orders || []).map((shopifyOrder) => {
    const bookedUnits = shopifyOrder.bookedUnits || sumLineValues(shopifyOrder.lineItems, "quantity");
    const activeUnits = sumLineValues(shopifyOrder.lineItems, "currentQuantity");
    const refundedAmount = money(shopifyOrder.refundedAmount);
    const isCancelled = isCancelledShopifyOrder(shopifyOrder);
    const { order: shiprocketOrder, matchType } = matchShiprocketOrder(shopifyOrder, indexes);
    const shipmentBucket = shiprocketOrder ? classifyShiprocketStatus(shiprocketOrder) : STATUS_BUCKETS.UNMATCHED;
    const confidence = inferMatchConfidence(shopifyOrder, shiprocketOrder, matchType);
    const primaryShipment = shiprocketOrder?.shipments?.[0] || null;

    if (shiprocketOrder?.id) {
      shiprocketMatchedIds.add(shiprocketOrder.id);
    }

    incrementMetric(metrics.shopifyBooked, isCancelled ? 0 : 1, bookedUnits, shopifyOrder.total);

    if (isCancelled) {
      incrementMetric(metrics.cancelled, 1, bookedUnits, shopifyOrder.total);
    } else if (shipmentBucket === STATUS_BUCKETS.DELIVERED) {
      incrementMetric(metrics.delivered, 1, activeUnits, Math.max(0, shopifyOrder.total - refundedAmount));
    } else if ([STATUS_BUCKETS.PICKUP_PENDING, STATUS_BUCKETS.IN_TRANSIT, STATUS_BUCKETS.NDR, STATUS_BUCKETS.UNKNOWN].includes(shipmentBucket)) {
      incrementMetric(metrics.pending, 1, activeUnits, shopifyOrder.total);
    } else if ([STATUS_BUCKETS.RTO, STATUS_BUCKETS.DESTROYED, STATUS_BUCKETS.LOST_DAMAGED].includes(shipmentBucket)) {
      incrementMetric(metrics.rto, 1, activeUnits, shopifyOrder.total);
    } else if (shipmentBucket === STATUS_BUCKETS.RETURN) {
      incrementMetric(metrics.returns, 1, activeUnits, shopifyOrder.total);
    } else if (shipmentBucket === STATUS_BUCKETS.CANCELLED) {
      incrementMetric(metrics.cancelled, 1, activeUnits, shopifyOrder.total);
    } else if (shipmentBucket === STATUS_BUCKETS.UNMATCHED) {
      incrementMetric(metrics.unmatched, 1, activeUnits, shopifyOrder.total);
    }

    return {
      shopifyOrderId: shopifyOrder.id,
      shopifyOrderName: shopifyOrder.name,
      processedAt: shopifyOrder.processedAt,
      createdAt: shopifyOrder.createdAt,
      total: shopifyOrder.total,
      subtotal: shopifyOrder.subtotal,
      refundedAmount,
      bookedUnits,
      activeUnits,
      currencyCode: shopifyOrder.currencyCode,
      financialStatus: shopifyOrder.financialStatus,
      fulfillmentStatus: shopifyOrder.fulfillmentStatus,
      paymentGatewayNames: shopifyOrder.paymentGatewayNames || [],
      paymentMethod: inferPaymentMethod(shopifyOrder),
      cancelledAt: shopifyOrder.cancelledAt,
      cancelReason: shopifyOrder.cancelReason,
      shipmentBucket,
      shiprocketStatus: shiprocketOrder?.status || "Unmatched / Needs Review",
      shiprocketOrderId: shiprocketOrder?.id || null,
      shiprocketShipmentId: primaryShipment?.id || null,
      courierName: primaryShipment?.courier || "",
      awb: primaryShipment?.awb || shopifyOrder.trackingNumbers?.[0] || "",
      deliveredDate: primaryShipment?.delivered_date || "",
      rtoDeliveredDate: primaryShipment?.rto_delivered_date || "",
      matched: Boolean(shiprocketOrder),
      matchType: matchType || "unmatched",
      matchConfidence: confidence,
      lineItems: shopifyOrder.lineItems,
      shippingAddress: shopifyOrder.shippingAddress,
    };
  });

  const unmatchedShiprocketOrders = (shiprocketCache.orders || [])
    .filter((order) => !shiprocketMatchedIds.has(order.id))
    .map((order) => ({
      shiprocketOrderId: order.id,
      channelOrderId: order.channel_order_id,
      status: order.status,
      total: money(order.total),
      customerPhone: order.customer_phone || "",
    }));

  const shippedOrders = metrics.delivered.orders + metrics.pending.orders + metrics.rto.orders + metrics.returns.orders;
  const deliveredOrders = metrics.delivered.orders;
  const returnOrders = metrics.returns.orders;
  const rtoOrders = metrics.rto.orders;
  const trueNetSales = metrics.delivered.sales - metrics.returns.sales - sumLineValues(reconciledOrders, "refundedAmount");
  const analytics = buildAnalytics(reconciledOrders, safeDays);

  const payload = {
    meta: {
      analyticsSchemaVersion: ANALYTICS_SCHEMA_VERSION,
      days: safeDays,
      generatedAt: new Date().toISOString(),
      lastShopifyRefresh: shopifyCache.refreshedAt,
      lastShiprocketRefresh: shiprocketCache.refreshedAt,
      lastReconciliation: new Date().toISOString(),
      shiprocketConfigured: Boolean(shiprocketCache.configured),
      caches: {
        shopify: shopifyCachePath,
        shiprocket: shiprocketCachePath,
        reconciled: reconciledCachePath,
      },
    },
    summary: {
      shopifyBookedOrders: metrics.shopifyBooked.orders,
      shopifyBookedUnits: metrics.shopifyBooked.units,
      shopifyBookedSales: metrics.shopifyBooked.sales,
      actualDeliveredOrders: metrics.delivered.orders,
      actualDeliveredUnits: metrics.delivered.units,
      actualDeliveredSales: metrics.delivered.sales,
      pendingOrders: metrics.pending.orders,
      pendingUnits: metrics.pending.units,
      pendingSalesValue: metrics.pending.sales,
      rtoOrders,
      rtoUnits: metrics.rto.units,
      rtoSalesValue: metrics.rto.sales,
      returnOrders,
      returnUnits: metrics.returns.units,
      returnSalesValue: metrics.returns.sales,
      cancelledOrders: metrics.cancelled.orders,
      cancelledUnits: metrics.cancelled.units,
      refundedAmount: sumLineValues(reconciledOrders, "refundedAmount"),
      trueNetSales,
      unmatchedShopifyOrders: metrics.unmatched.orders,
      unmatchedShiprocketShipments: unmatchedShiprocketOrders.length,
      deliverySuccessRate: shippedOrders > 0 ? deliveredOrders / shippedOrders : 0,
      rtoRate: shippedOrders > 0 ? rtoOrders / shippedOrders : 0,
      returnRate: deliveredOrders > 0 ? returnOrders / deliveredOrders : 0,
    },
    metrics,
    analytics,
    reconciledOrders,
    unmatchedShiprocketOrders,
    warnings: shiprocketCache.configured
      ? warnings
      : [
          ...warnings,
          "Shiprocket credentials/token are missing or invalid. Reconciliation is running in Shopify-only fallback mode.",
        ],
    statusMap,
  };

  writeJson(reconciledCachePath, payload);
  return payload;
}

export async function getActualSalesSummary({ days = 30, refresh = false } = {}) {
  if (refresh) {
    return reconcileSalesData({ days, forceRefresh: true });
  }

  const cached = readJson(reconciledCachePath);
  if (
    cached &&
    Number(cached.meta?.days || 0) === Number(days || 30) &&
    Number(cached.meta?.analyticsSchemaVersion || 0) === ANALYTICS_SCHEMA_VERSION
  ) {
    return cached;
  }

  return reconcileSalesData({ days });
}

export async function getSalesAnalyticsSlice(type, options = {}) {
  const payload = await getActualSalesSummary(options);
  return {
    meta: payload.meta,
    [type]: payload.analytics?.[type] || [],
  };
}

export async function getSalesExport({ type = "reconciled-orders", days = 30, refresh = false } = {}) {
  const payload = await getActualSalesSummary({ days, refresh });
  const shopifySource = getCachedSource(shopifyCachePath);
  const shiprocketSource = getCachedSource(shiprocketCachePath);
  const exportMap = {
    "normalized-shopify": exportRowsForNormalizedShopifyOrders(shopifySource?.orders || []),
    "normalized-shiprocket": exportRowsForNormalizedShiprocketOrders(shiprocketSource?.orders || []),
    "reconciled-orders": exportRowsForReconciledOrders(payload.reconciledOrders),
    "brand-performance": payload.analytics?.brandPerformance || [],
    "type-performance": payload.analytics?.typePerformance || [],
    "color-performance": payload.analytics?.colorPerformance || [],
    "sku-performance": payload.analytics?.skuPerformance || [],
    "courier-performance": payload.analytics?.courierPerformance || [],
    "pincode-performance": payload.analytics?.pincodePerformance || [],
    "state-performance": payload.analytics?.statePerformance || [],
    "city-performance": payload.analytics?.cityPerformance || [],
    "payment-method-performance": payload.analytics?.paymentMethodPerformance || [],
    "rto-analysis": payload.analytics?.rtoAnalysis?.bySku || [],
    "restock-suggestions": payload.analytics?.restockSuggestions || [],
    "reconciliation-issues": exportRowsForReconciliationIssues(payload.analytics?.reconciliationIssues),
    recommendations: payload.analytics?.recommendations || [],
    "pending-risk": payload.analytics?.pendingRisk || [],
    "unmatched-orders": payload.unmatchedShiprocketOrders || [],
  };

  const rows = exportMap[type] || exportMap["reconciled-orders"];
  return {
    filename: `${type}-${Number(days || 30)}d.csv`,
    csv: toCsv(rows),
  };
}
