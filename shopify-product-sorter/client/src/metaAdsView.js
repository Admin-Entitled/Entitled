/**
 * Meta Ads Dashboard view helpers (pure, unit-testable).
 *
 * Owns date-range presets, backend-normalized status presentation, performance
 * filters/signals and table sorting. No DOM, no API calls, no Meta token.
 */

// ────────────────────────────────────────────────────────────────────────────
// Date range presets (canonical frontend/backend contract: YYYY-MM-DD)
// ────────────────────────────────────────────────────────────────────────────

export const META_DATE_RANGE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "Last 7 Days" },
  { key: "last14", label: "Last 14 Days" },
  { key: "last30", label: "Last 30 Days" },
  { key: "custom", label: "Custom" },
];

export function toDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Compute a preset range as { since, until } in the ACCOUNT timezone, not the
 * browser timezone. Falls back to local time when no account timezone is known.
 */
export function presetToRange(presetKey, timezone = null) {
  const now = new Date();
  const today = new Date(now);
  if (timezone) {
    // Resolve the account's current calendar date via Intl formatting parts.
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";
    today.setFullYear(Number(get("year")), Number(get("month")) - 1, Number(get("day")));
  }

  const since = new Date(today);
  const until = new Date(today);

  if (presetKey === "today") {
    return { since: toDateString(since), until: toDateString(until) };
  }
  if (presetKey === "yesterday") {
    since.setDate(since.getDate() - 1);
    until.setDate(until.getDate() - 1);
    return { since: toDateString(since), until: toDateString(until) };
  }
  if (presetKey === "last7") {
    since.setDate(since.getDate() - 7);
    until.setDate(until.getDate() - 1);
    return { since: toDateString(since), until: toDateString(until) };
  }
  if (presetKey === "last14") {
    since.setDate(since.getDate() - 14);
    until.setDate(until.getDate() - 1);
    return { since: toDateString(since), until: toDateString(until) };
  }
  // last30 (default)
  since.setDate(since.getDate() - 30);
  until.setDate(until.getDate() - 1);
  return { since: toDateString(since), until: toDateString(until) };
}

export function presetLabel(presetKey) {
  return META_DATE_RANGE_PRESETS.find((p) => p.key === presetKey)?.label || "Last 30 Days";
}

// ────────────────────────────────────────────────────────────────────────────
// Performance filters & signals (transparent thresholds)
// ────────────────────────────────────────────────────────────────────────────

export const META_PERFORMANCE_FILTERS = [
  { key: "all", label: "All" },
  { key: "with-purchases", label: "With Purchases" },
  { key: "zero-purchases", label: "Zero Purchases" },
  { key: "spending-zero", label: "Spending With Zero Purchases" },
];

/** Low CTR threshold (percent). Transparent and documented. */
export const LOW_CTR_THRESHOLD_PCT = 1.0;
/** High CPC threshold factor vs. median CPC across rows with clicks. */
export const HIGH_CPC_FACTOR = 2.0;

export function matchesPerformanceFilter(row, filterKey) {
  const i = row?.insights || {};
  const spend = Number(i.spend || 0);
  const purchases = Number(i.purchases || 0);
  switch (filterKey) {
    case "with-purchases":
      return purchases > 0;
    case "zero-purchases":
      return purchases === 0;
    case "spending-zero":
      return spend > 0 && purchases === 0;
    default:
      return true;
  }
}

/**
 * Factual performance signals per row. Thresholds are explicit and exposed.
 * Returns an array of { key, label, tone }.
 */
export function computeSignals(row, { topRoasIds = new Set() } = {}) {
  if (!row) return [];
  const i = row?.insights || {};
  const spend = Number(i.spend || 0);
  const purchases = Number(i.purchases || 0);
  const clicks = Number(i.clicks || 0);
  const impressions = Number(i.impressions || 0);
  const signals = [];

  if (spend > 0 && purchases === 0) {
    signals.push({ key: "zero-purchase-spend", label: "SPEND WITH ZERO PURCHASES", tone: "danger" });
  }
  if (topRoasIds.has(String(row?.id))) {
    signals.push({ key: "top-roas", label: "TOP ROAS", tone: "success" });
  }
  if (impressions > 0 && Number(i.ctr || 0) < LOW_CTR_THRESHOLD_PCT) {
    signals.push({ key: "low-ctr", label: "LOW CTR", tone: "warn" });
  }
  if (row._highCpc) {
    signals.push({ key: "high-cpc", label: "HIGH CPC", tone: "warn" });
  }
  return signals;
}

/** Identify the top-ROAS entity IDs among rows with spend > 0. */
export function topRoasIds(rows, count = 3) {
  const candidates = rows
    .filter((row) => Number(row?.insights?.spend || 0) > 0)
    .map((row) => ({ id: String(row.id), roas: Number(row.insights?.purchaseRoas || 0) }))
    .sort((a, b) => b.roas - a.roas)
    .slice(0, count);
  return new Set(candidates.map((c) => c.id));
}

/** Median CPC across rows with clicks, used by the HIGH CPC signal. */
export function medianCpc(rows) {
  const cps = rows
    .map((row) => Number(row?.insights?.cpc || 0))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (cps.length === 0) return 0;
  const mid = Math.floor(cps.length / 2);
  return cps.length % 2 === 0 ? (cps[mid - 1] + cps[mid]) / 2 : cps[mid];
}

/** Attach a high-cpc flag to signals based on the median threshold. */
export function withCpcSignal(rows) {
  const median = medianCpc(rows);
  return rows.map((row) => {
    const cpc = Number(row?.insights?.cpc || 0);
    const high = median > 0 && cpc > median * HIGH_CPC_FACTOR;
    if (high && row.insights) {
      row = {
        ...row,
        insights: { ...row.insights },
      };
      row._highCpc = true;
    }
    return row;
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Sorting
// ────────────────────────────────────────────────────────────────────────────

export const META_CAMPAIGN_SORT_KEYS = [
  { key: "name", label: "Campaign" },
  { key: "status", label: "Status" },
  { key: "spend", label: "Spend" },
  { key: "purchases", label: "Purchases" },
  { key: "purchaseValue", label: "Purchase Value" },
  { key: "purchaseRoas", label: "ROAS" },
  { key: "impressions", label: "Impressions" },
  { key: "clicks", label: "Clicks" },
  { key: "ctr", label: "CTR" },
  { key: "cpc", label: "CPC" },
  { key: "cpm", label: "CPM" },
];

export function sortEntities(rows, sortKey, direction) {
  const dir = direction === "asc" ? 1 : -1;
  const copy = [...rows];
  const valueOf = (row) => {
    if (sortKey === "name") return row.name || "";
    if (sortKey === "status") return row.effectiveStatus || row.status || "";
    const i = row.insights || {};
    return Number(i[sortKey] || 0);
  };
  copy.sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (typeof va === "string" || typeof vb === "string") {
      return String(va).localeCompare(String(vb)) * dir;
    }
    return (va - vb) * dir;
  });
  return copy;
}

// ────────────────────────────────────────────────────────────────────────────
// Connection state helpers
// ────────────────────────────────────────────────────────────────────────────

export const META_CONNECTION_STATES = [
  "NOT_CONFIGURED",
  "CONNECTING",
  "LOADING",
  "CONNECTED",
  "EMPTY",
  "ERROR",
  "INVALID_TOKEN",
  "INSUFFICIENT_PERMISSIONS",
  "RATE_LIMITED",
  "UNAVAILABLE",
];

export function connectionStateLabel(status) {
  switch (status) {
    case "NOT_CONFIGURED":
      return "NOT CONFIGURED";
    case "CONNECTED":
      return "CONNECTED";
    case "INVALID_TOKEN":
      return "INVALID TOKEN";
    case "INSUFFICIENT_PERMISSIONS":
      return "PERMISSION REQUIRED";
    case "RATE_LIMITED":
      return "RATE LIMITED";
    case "UNAVAILABLE":
      return "UNAVAILABLE";
    case "EMPTY":
      return "EMPTY";
    default:
      return "CONNECTING";
  }
}

export function isErrorConnectionStatus(status) {
  return ["ERROR", "INVALID_TOKEN", "INSUFFICIENT_PERMISSIONS", "RATE_LIMITED", "UNAVAILABLE"].includes(status);
}
