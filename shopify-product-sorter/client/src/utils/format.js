/**
 * Canonical client-side formatting helpers (FE-format).
 *
 * Single home for INR money formatting and date/number display. Modules must
 * import from here instead of scattering `Intl.NumberFormat(...)` or "₹"
 * literals through components.
 */

/**
 * Canonical INR money formatter (Product Sorter semantics).
 * Handles zero, null, undefined, negative, decimals, and numeric strings.
 * Uses en-IN locale so Indian grouping (e.g. ₹1,25,000) is applied.
 */
export function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Compact INR currency formatter (Order Mapping semantics).
 * Preserves two decimal places for exact order amounts.
 */
export function formatCurrency(value) {
  const amount = Number.parseFloat(value || 0);
  if (!Number.isFinite(amount)) {
    return "—";
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Plain en-IN number grouping (e.g. counts).
 */
export function formatCount(value) {
  return new Intl.NumberFormat("en-IN").format(Number(value || 0));
}

/**
 * Generic date display (Sorter semantics): browser-locale string, "Never"
 * when absent.
 */
export function formatDate(value) {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

/**
 * Order-timestamp display (Order Mapping semantics): en-IN locale rendered in
 * Asia/Kolkata with a medium date and short time, "—" when absent.
 */
export function formatDateTime(value) {
  if (!value) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

/**
 * Null-safe string rendering ("—" when absent).
 */
export function formatText(value) {
  return value ? String(value) : "—";
}

/**
 * Null-safe numeric coercion.
 */
export function safeNumber(value, fallback = 0) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
}
