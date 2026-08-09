/**
 * Sidebar Navigation Modules Classification
 * Active modules are enabled with route ownership.
 * Disabled items are unclickable placeholders with no executable owner claim.
 * classification: ACTIVE_FEATURE | INTENTIONAL_DISABLED | DEFERRED_META |
 *                 COMPATIBILITY_ENTRY | REMOVE_AFTER_PROOF | UNRESOLVED
 */
export const sidebarModules = [
  { id: "sorter", label: "Shopify Collection Manager", enabled: true, ownerClaim: "Sorter", classification: "ACTIVE_FEATURE" },
  { id: "order-mapping", label: "Order Mapping", enabled: true, ownerClaim: "OrderMapping", classification: "ACTIVE_FEATURE" },
  { id: "sku-image-manager", label: "SKU Image Manager", enabled: true, ownerClaim: "SkuImageManager", classification: "ACTIVE_FEATURE" },
  { id: "network", label: "Network Activity", enabled: true, ownerClaim: "Network", classification: "ACTIVE_FEATURE" },
  { id: "diagnostics", label: "System Diagnostics", enabled: true, ownerClaim: "Diagnostics", classification: "ACTIVE_FEATURE" },
  { id: "meta-ads", label: "Meta Ads Dashboard", enabled: true, ownerClaim: "MetaAdsDashboard", classification: "ACTIVE_FEATURE" },
  { id: "analytics", label: "Product Analytics", enabled: false, ownerClaim: null, classification: "INTENTIONAL_DISABLED" },
  { id: "inventory", label: "Inventory", enabled: false, ownerClaim: null, classification: "INTENTIONAL_DISABLED" },
  { id: "reports", label: "Reports", enabled: false, ownerClaim: null, classification: "INTENTIONAL_DISABLED" },
  { id: "settings", label: "Settings", enabled: false, ownerClaim: null, classification: "INTENTIONAL_DISABLED" },
];

export function getActiveModules() {
  return sidebarModules.filter((mod) => mod.enabled);
}

export function getDisabledModules() {
  return sidebarModules.filter((mod) => !mod.enabled);
}
