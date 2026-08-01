/**
 * Sidebar Navigation Modules Classification
 * Active modules are enabled with route ownership.
 * Disabled items are unclickable placeholders with no executable owner claim.
 */
export const sidebarModules = [
  { id: "sorter", label: "Shopify Collection Manager", enabled: true, ownerClaim: "Sorter" },
  { id: "order-mapping", label: "Order Mapping", enabled: true, ownerClaim: "OrderMapping" },
  { id: "sku-image-manager", label: "SKU Image Manager", enabled: true, ownerClaim: "SkuImageManager" },
  { id: "meta-ads", label: "Meta Ads Dashboard", enabled: false, ownerClaim: null },
  { id: "analytics", label: "Product Analytics", enabled: false, ownerClaim: null },
  { id: "inventory", label: "Inventory", enabled: false, ownerClaim: null },
  { id: "reports", label: "Reports", enabled: false, ownerClaim: null },
  { id: "settings", label: "Settings", enabled: false, ownerClaim: null },
];

export function getActiveModules() {
  return sidebarModules.filter((mod) => mod.enabled);
}

export function getDisabledModules() {
  return sidebarModules.filter((mod) => !mod.enabled);
}
