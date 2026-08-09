import React from "react";
import { formatMoneyForCurrency } from "./utils/format.js";

/** Compact KPI card used in the Meta Ads summary strip. */
export function MetaKpiCard({ label, value, detail = null, tone = "default" }) {
  return (
    <div className={`meta-kpi-card meta-kpi-card--${tone}`}>
      <span className="meta-kpi-label">{label}</span>
      <strong className="meta-kpi-value">{value}</strong>
      {detail ? <span className="meta-kpi-detail">{detail}</span> : null}
    </div>
  );
}

/** Money-formatted KPI card using the account currency. */
export function MetaMoneyKpiCard({ label, value, currency, detail = null, tone = "default" }) {
  return (
    <MetaKpiCard
      label={label}
      value={formatMoneyForCurrency(value, currency, { maximumFractionDigits: 0 })}
      detail={detail}
      tone={tone}
    />
  );
}

/** Backend-normalized status badge (renders labels, never raw provider states). */
export function MetaStatusBadge({ statusObj }) {
  const label = statusObj?.effectiveLabel || statusObj?.label || "Unknown";
  const tone = statusObj?.tone || "neutral";
  return <span className={`meta-status-badge meta-status-${tone}`}>{label}</span>;
}

/** Clickable sortable table header. */
export function MetaSortableTh({ label, sortKey, sort, onSort }) {
  const active = sort?.key === sortKey;
  const arrow = active ? (sort?.direction === "asc" ? " ▲" : " ▼") : "";
  return (
    <th>
      <button
        type="button"
        className="meta-sort-button"
        onClick={() => onSort(sortKey)}
        aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}{arrow}
      </button>
    </th>
  );
}

/** Factual performance signal tags. */
export function MetaSignalTag({ signal }) {
  return <span className={`meta-signal-tag meta-signal--${signal.tone}`}>{signal.label}</span>;
}

/** Small empty/zero-state block. */
export function MetaEmptyState({ message }) {
  return (
    <div className="meta-empty-state">
      <p>{message || "No data available for the selected range."}</p>
    </div>
  );
}
