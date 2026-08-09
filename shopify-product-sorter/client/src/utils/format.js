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
 * Account-currency money formatter (Meta Ads semantics).
 * Uses the ad account's currency (e.g. INR, USD) — never assumed. For INR the
 * en-IN locale is used so Indian grouping (₹1,25,000) is applied. Falls back
 * to a neutral numeric format when the value is not a finite number.
 */
export function formatMoneyForCurrency(value, currencyCode = "INR", { maximumFractionDigits = 2 } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "₹0";
  const currency = String(currencyCode || "INR").toUpperCase();
  // INR must use the en-IN locale (Indian grouping). Other account currencies
  // use the runtime default locale so the correct currency symbol is rendered
  // without ever hardcoding a USD/en-US assumption.
  const locale = currency === "INR" ? "en-IN" : undefined;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits,
    }).format(amount);
  } catch {
    // Unknown currency code: fall back to a plain grouped number.
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(amount);
  }
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

/**
 * User-friendly date formatter for Meta range summary (e.g., 2 Aug 2026).
 */
export function formatFriendlyDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}
