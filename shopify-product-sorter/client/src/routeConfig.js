/**
 * Frontend route resolution (FE-011).
 * Pure functions that decide which root component serves a pathname.
 * Kept free of DOM/React so direct URLs, refresh resolution, legacy
 * redirects and unknown-route fallback can be unit-tested.
 */

export const LEGACY_REDIRECTS = {
  "/delivery-resolution": "/order-mapping",
};

export const ROOT_PATHS = {
  ORDER_MAPPING: "/order-mapping",
};

export const ROOT_NAMES = {
  ORDER_MAPPING: "order-mapping",
  APP: "app",
};

/**
 * Legacy compatibility entries: returns the canonical replacement path
 * for deprecated URLs, or null when the path needs no redirect.
 */
export function legacyRedirectFor(pathname) {
  return LEGACY_REDIRECTS[pathname] || null;
}

/**
 * Maps a pathname to the root component that must serve it.
 * - "/order-mapping" and legacy "/delivery-resolution" -> Order Mapping root
 * - everything else -> app shell (fails safely; unknown routes are not crashes)
 * Pathname-based resolution is inherently refresh-safe: the same URL always
 * resolves to the same root.
 */
export function resolveRootPath(pathname) {
  return pathname === ROOT_PATHS.ORDER_MAPPING || pathname === "/delivery-resolution"
    ? ROOT_NAMES.ORDER_MAPPING
    : ROOT_NAMES.APP;
}
