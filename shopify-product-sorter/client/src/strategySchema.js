/**
 * Sorter strategy schema: canonical weight-field descriptors and presets.
 *
 * The six weight keys mirror the backend strategy schema exactly
 * (server/src/services/strategySettings.js). Values are fractional (0–1) and
 * must total exactly 1.00.
 */

export const WEIGHT_KEYS = [
  "salesWeight",
  "revenueWeight",
  "inventoryWeight",
  "newnessWeight",
  "momentumWeight",
  "rotationWeight",
];

/** Initial strategy state — must match the backend DEFAULT_STRATEGY. */
export const DEFAULT_STRATEGY_WEIGHTS = {
  salesWeight: 0.30,
  revenueWeight: 0.20,
  inventoryWeight: 0.15,
  newnessWeight: 0.15,
  momentumWeight: 0.10,
  rotationWeight: 0.10,
};

export const INITIAL_SETTINGS = {
  firstPageLimit: 40,
  ...DEFAULT_STRATEGY_WEIGHTS,
  override: false,
};

export const weightFields = [
  { key: "salesWeight", label: "Recent Sales Velocity", description: "Historical gross sales strength (log-scaled 7/30/90d units)" },
  { key: "revenueWeight", label: "Revenue", description: "Historical gross revenue performance (log-scaled)" },
  { key: "inventoryWeight", label: "Inventory / Availability", description: "Sellable stock depth × size variant coverage" },
  { key: "newnessWeight", label: "New Product Boost", description: "Boost for products published in the last 30 days" },
  { key: "momentumWeight", label: "Sales Momentum", description: "Recent sales velocity vs prior 23-day baseline" },
  { key: "rotationWeight", label: "Rotation / Diversity", description: "Deterministic daily variation to avoid staleness" },
];

export const STRATEGY_PRESETS = {
  "Balanced": { salesWeight: 0.3, revenueWeight: 0.2, inventoryWeight: 0.15, newnessWeight: 0.15, momentumWeight: 0.1, rotationWeight: 0.1 },
  "Revenue First": { salesWeight: 0.1, revenueWeight: 0.6, inventoryWeight: 0.1, newnessWeight: 0.1, momentumWeight: 0.05, rotationWeight: 0.05 },
  "Fast Sellers": { salesWeight: 0.6, revenueWeight: 0.1, inventoryWeight: 0.1, newnessWeight: 0.1, momentumWeight: 0.05, rotationWeight: 0.05 },
  "New Launch Push": { salesWeight: 0.1, revenueWeight: 0.1, inventoryWeight: 0.1, newnessWeight: 0.5, momentumWeight: 0.1, rotationWeight: 0.1 },
  "Inventory Clearance": { salesWeight: 0.1, revenueWeight: 0.1, inventoryWeight: 0.5, newnessWeight: 0.1, momentumWeight: 0.1, rotationWeight: 0.1 },
  "Discovery / Rotation": { salesWeight: 0.1, revenueWeight: 0.1, inventoryWeight: 0.1, newnessWeight: 0.1, momentumWeight: 0.1, rotationWeight: 0.5 },
};
