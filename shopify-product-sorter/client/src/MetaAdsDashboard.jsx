import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api as metaAdsApi } from "./metaAdsApi.js";
import {
  connectionStateLabel,
  isErrorConnectionStatus,
  matchesPerformanceFilter,
  presetLabel,
  presetToRange,
  sortEntities,
  computeSignals,
  topRoasIds,
  withCpcSignal,
  META_PERFORMANCE_FILTERS,
  META_CAMPAIGN_SORT_KEYS,
} from "./metaAdsView.js";
import {
  MetaKpiCard,
  MetaMoneyKpiCard,
  MetaStatusBadge,
  MetaSortableTh,
  MetaSignalTag,
  MetaEmptyState,
} from "./MetaAdsComponents.jsx";
import { formatMoneyForCurrency, formatCount, formatFriendlyDate } from "./utils/format.js";

const STATUS_FILTERS = [
  { key: "ALL", label: "All Statuses" },
  { key: "ACTIVE", label: "Active" },
  { key: "PAUSED", label: "Paused" },
  { key: "ARCHIVED", label: "Archived" },
];

const DEFAULT_RANGE = presetToRange("last30");

function matchStatusFilter(entity, filter) {
  if (filter === "ALL") return true;
  const effective = entity?.effectiveStatus || entity?.status;
  return effective === filter;
}

/**
 * Dual-scale daily trend chart.
 *
 * - Spend → bars, left Y-axis (account currency)
 * - Purchases → line + dots, right Y-axis (integer count)
 * - Separate scales prevent Purchases from collapsing visually against large Spend values.
 * - Tooltip on hover/focus.
 * - Empty state when both spend and purchases are zero for the entire range.
 * - Error state surfaced from parent via `error` prop.
 */
function DailyTrendChart({ daily, currency, error, loading }) {
  const [tooltip, setTooltip] = React.useState(null);
  const svgRef = React.useRef(null);

  if (error) {
    return (
      <div className="meta-chart-error" role="alert">
        Daily performance data could not be loaded.
        <span className="meta-chart-error-detail">{error}</span>
      </div>
    );
  }

  if (loading) {
    return <div className="meta-chart-loading">Loading daily data…</div>;
  }

  if (!daily || daily.length === 0) {
    return <MetaEmptyState message="No daily trend data for the selected range." />;
  }

  const allZero = daily.every((d) => d.spend === 0 && d.purchases === 0);
  if (allZero) {
    return <MetaEmptyState message="No Meta activity for this date range." />;
  }

  // ── Layout constants ──────────────────────────────────────────────────────
  const PAD_LEFT = 72;   // left axis labels
  const PAD_RIGHT = 52;  // right axis labels
  const PAD_TOP = 16;
  const PAD_BOTTOM = 36; // x-axis labels
  const CHART_H = 240;   // inner chart height (plot area)
  const SVG_H = PAD_TOP + CHART_H + PAD_BOTTOM;
  const n = daily.length;

  // We use a percentage-width SVG so it fills the container responsively.
  // viewBox width = 700 (arbitrary reference unit).
  const VW = 700;
  const INNER_W = VW - PAD_LEFT - PAD_RIGHT;
  const colW = INNER_W / n;

  // ── Scales ────────────────────────────────────────────────────────────────
  const maxSpend = Math.max(...daily.map((d) => d.spend), 1);
  const maxPurch = Math.max(...daily.map((d) => d.purchases), 1);

  function spendY(v) {
    return PAD_TOP + CHART_H - (v / maxSpend) * CHART_H;
  }
  function purchY(v) {
    return PAD_TOP + CHART_H - (v / maxPurch) * CHART_H;
  }

  // Bar center x for each day
  function barX(i) {
    return PAD_LEFT + i * colW + colW / 2;
  }
  const barW = Math.max(colW * 0.45, 4);

  // ── Left axis ticks (spend) ───────────────────────────────────────────────
  const SPEND_TICKS = 5;
  const spendTicks = Array.from({ length: SPEND_TICKS + 1 }, (_, i) => {
    const v = (maxSpend / SPEND_TICKS) * i;
    return { v, y: spendY(v), label: formatMoneyForCurrency(v, currency, { maximumFractionDigits: 0 }) };
  });

  // ── Right axis ticks (purchases) ─────────────────────────────────────────
  const PURCH_TICKS = Math.min(maxPurch, 5);
  const purchStep = Math.ceil(maxPurch / PURCH_TICKS);
  const purchTicks = Array.from({ length: Math.ceil(maxPurch / purchStep) + 1 }, (_, i) => {
    const v = purchStep * i;
    return { v: Math.min(v, maxPurch + purchStep), y: purchY(Math.min(v, maxPurch)), label: String(Math.min(v, maxPurch + purchStep)) };
  }).filter((t) => t.v <= maxPurch + 0.01);

  // ── Purchases polyline points ─────────────────────────────────────────────
  const linePoints = daily.map((d, i) => `${barX(i)},${purchY(d.purchases)}`).join(" ");

  // ── X-axis labels: show every label if <=10, else every other ────────────
  const labelStride = n > 14 ? 3 : n > 7 ? 2 : 1;

  // ── Tooltip formatting ────────────────────────────────────────────────────
  function handleMouseEnter(d, i) {
    const x = barX(i);
    const dateStr = d.date;
    const [y, m, day] = dateStr.split("-");
    const label = new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    setTooltip({
      x,
      y: Math.min(spendY(d.spend), purchY(d.purchases)) - 8,
      date: label,
      spend: formatMoneyForCurrency(d.spend, currency, { maximumFractionDigits: 2 }),
      purchases: d.purchases,
      costPerPurchase: d.costPerPurchase != null ? formatMoneyForCurrency(d.costPerPurchase, currency, { maximumFractionDigits: 2 }) : null,
      purchaseValue: d.purchaseValue > 0 ? formatMoneyForCurrency(d.purchaseValue, currency, { maximumFractionDigits: 0 }) : null,
      roas: d.purchaseRoas > 0 ? d.purchaseRoas.toFixed(2) : null,
      noActivity: d.noActivity,
    });
  }

  return (
    <div className="meta-chart-svg-wrap" role="img" aria-label="Daily spend and purchases trend">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${SVG_H}`}
        preserveAspectRatio="none"
        className="meta-chart-svg"
        onMouseLeave={() => setTooltip(null)}
      >
        {/* Grid lines */}
        {spendTicks.map((t) => (
          <line
            key={t.v}
            x1={PAD_LEFT} y1={t.y}
            x2={VW - PAD_RIGHT} y2={t.y}
            className="meta-chart-grid"
          />
        ))}

        {/* Left Y-axis labels (spend) */}
        {spendTicks.map((t) => (
          <text key={t.v} x={PAD_LEFT - 6} y={t.y + 4} className="meta-chart-axis-label meta-chart-axis-label--left">
            {t.label}
          </text>
        ))}

        {/* Right Y-axis labels (purchases) */}
        {purchTicks.map((t) => (
          <text key={t.v} x={VW - PAD_RIGHT + 6} y={t.y + 4} className="meta-chart-axis-label meta-chart-axis-label--right">
            {t.label}
          </text>
        ))}

        {/* Spend bars */}
        {daily.map((d, i) => (
          <rect
            key={d.date}
            x={barX(i) - barW / 2}
            y={spendY(d.spend)}
            width={barW}
            height={Math.max(CHART_H - (spendY(d.spend) - PAD_TOP), 1)}
            className={`meta-chart-bar-svg${d.noActivity ? " meta-chart-bar-svg--inactive" : ""}`}
            onMouseEnter={() => handleMouseEnter(d, i)}
          />
        ))}

        {/* Purchases line */}
        {daily.length > 1 && (
          <polyline
            points={linePoints}
            className="meta-chart-line"
            fill="none"
          />
        )}

        {/* Purchases dots */}
        {daily.map((d, i) => (
          <circle
            key={d.date}
            cx={barX(i)}
            cy={purchY(d.purchases)}
            r={4}
            className={`meta-chart-dot${d.noActivity ? " meta-chart-dot--inactive" : ""}`}
            onMouseEnter={() => handleMouseEnter(d, i)}
          />
        ))}

        {/* X-axis labels */}
        {daily.map((d, i) => {
          if (i % labelStride !== 0) return null;
          const [, , day] = d.date.split("-");
          const month = new Date(`${d.date}T12:00:00Z`).toLocaleDateString("en-IN", { month: "short" });
          return (
            <text key={d.date} x={barX(i)} y={SVG_H - 6} className="meta-chart-axis-label meta-chart-axis-label--x">
              {`${parseInt(day, 10)} ${month}`}
            </text>
          );
        })}

        {/* Axis lines */}
        <line x1={PAD_LEFT} y1={PAD_TOP} x2={PAD_LEFT} y2={PAD_TOP + CHART_H} className="meta-chart-axis" />
        <line x1={VW - PAD_RIGHT} y1={PAD_TOP} x2={VW - PAD_RIGHT} y2={PAD_TOP + CHART_H} className="meta-chart-axis meta-chart-axis--right" />
        <line x1={PAD_LEFT} y1={PAD_TOP + CHART_H} x2={VW - PAD_RIGHT} y2={PAD_TOP + CHART_H} className="meta-chart-axis" />
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="meta-chart-tooltip"
          style={{
            left: `${(tooltip.x / VW) * 100}%`,
            top: `${(Math.max(tooltip.y, PAD_TOP) / SVG_H) * 100}%`,
          }}
        >
          <div className="meta-chart-tooltip-date">{tooltip.date}</div>
          <div className="meta-chart-tooltip-row">
            <span className="meta-chart-tooltip-key">Spend</span>
            <span className="meta-chart-tooltip-val">{tooltip.spend}</span>
          </div>
          <div className="meta-chart-tooltip-row">
            <span className="meta-chart-tooltip-key">Purchases</span>
            <span className="meta-chart-tooltip-val">{tooltip.purchases}</span>
          </div>
          <div className="meta-chart-tooltip-row">
            <span className="meta-chart-tooltip-key">Cost / Purchase</span>
            <span className="meta-chart-tooltip-val">{tooltip.costPerPurchase || "—"}</span>
          </div>
          {tooltip.purchaseValue && (
            <div className="meta-chart-tooltip-row">
              <span className="meta-chart-tooltip-key">Purchase Value</span>
              <span className="meta-chart-tooltip-val">{tooltip.purchaseValue}</span>
            </div>
          )}
          {tooltip.roas && (
            <div className="meta-chart-tooltip-row">
              <span className="meta-chart-tooltip-key">ROAS</span>
              <span className="meta-chart-tooltip-val">{tooltip.roas}</span>
            </div>
          )}
          {tooltip.noActivity && (
            <div className="meta-chart-tooltip-note">No activity this day</div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="meta-chart-legend">
        <span><i className="meta-legend-swatch meta-legend-swatch--spend" /> Spend ({currency})</span>
        <span><i className="meta-legend-swatch meta-legend-swatch--purchases" /> Purchases (right axis)</span>
      </div>
    </div>
  );
}

export default function MetaAdsDashboard() {
  // ── connection / account context ──
  const [connection, setConnection] = useState({ status: "CONNECTING", ok: false });
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connectionError, setConnectionError] = useState("");

  // ── date range (kept while drilling) ──
  const [presetKey, setPresetKey] = useState("last30");
  const [customRange, setCustomRange] = useState({ since: "", until: "" });
  const range = presetKey === "custom"
    ? (customRange.since && customRange.until && customRange.since <= customRange.until ? customRange : { since: "", until: "" })
    : presetToRange(presetKey, connection?.timezone || null);

  const customRangeError = presetKey === "custom" && customRange.since && customRange.until && customRange.since > customRange.until
    ? "Start date must be less than or equal to end date."
    : "";

  // ── data ──
  const [summary, setSummary] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [adsets, setAdsets] = useState([]);
  const [ads, setAds] = useState([]);
  const [daily, setDaily] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState("");

  // ── drilldown hierarchy ──
  const [view, setView] = useState({ level: "campaigns", campaign: null, adset: null });

  // ── filters / sorting ──
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [performanceFilter, setPerformanceFilter] = useState("all");
  const [sort, setSort] = useState({ key: "spend", direction: "desc" });

  // ── refresh guard (no duplicate requests; data stays visible) ──
  const refreshInFlightRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reportMessage, setReportMessage] = useState("");

  const currency = connection?.ok ? connection.currency : "INR";
  const timezone = connection?.ok ? connection.timezone : null;

  // ── connection check ──
  const loadConnection = useCallback(async (bypass = false) => {
    setConnectionLoading(true);
    try {
      const result = await metaAdsApi.getHealth(bypass);
      setConnection(result);
      setConnectionError("");
      return result;
    } catch (err) {
      setConnectionError(err.message || "Failed to check Meta connectivity");
      setConnection((prev) => ({ ...prev, status: "ERROR" }));
      return { status: "ERROR", ok: false };
    } finally {
      setConnectionLoading(false);
    }
  }, []);

  // ── range-scoped data load ──
  const loadRangeData = useCallback(async (rangeOverride, bypass = false) => {
    const r = rangeOverride || range;
    if (!r.since || !r.until) return; // Prevent invalid custom range queries
    setDataLoading(true);
    setDataError("");
    setDailyError("");
    setDailyLoading(true);
    try {
      const [summaryRes, campaignsRes] = await Promise.all([
        metaAdsApi.getSummary(r.since, r.until, bypass),
        metaAdsApi.getCampaigns(r.since, r.until, bypass),
      ]);
      setSummary(summaryRes);
      setCampaigns(campaignsRes.campaigns || []);
    } catch (err) {
      setDataError(err.message || "Failed to load Meta Ads data");
    } finally {
      setDataLoading(false);
    }
    // Daily chart loads independently so a failure doesn't blank the whole dashboard.
    try {
      const dailyRes = await metaAdsApi.getDaily(r.since, r.until, bypass);
      setDaily(dailyRes.daily || []);
      setDailyError("");
    } catch (err) {
      setDailyError(err.message || "Failed to load daily chart data");
    } finally {
      setDailyLoading(false);
    }
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await loadConnection();
      if (cancelled) return;
      if (result?.ok) {
        // Compute the range in the ACCOUNT timezone (not the browser's) using
        // the freshly-fetched connection context, so the first data load uses
        // the same date boundaries the dashboard displays. Custom ranges are
        // explicit calendar dates and are used as-is.
        const accountTzRange =
          presetKey !== "custom" && result.timezone
            ? presetToRange(presetKey, result.timezone)
            : range;
        await loadRangeData(accountTzRange, false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload range data when the effective range changes while connected.
  useEffect(() => {
    if (connection?.ok && !dataLoading && range.since && range.until) {
      loadRangeData(range, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.since, range.until]);

  // ── refresh: keep existing data visible, no duplicate requests ──
  const handleRefresh = async () => {
    if (refreshInFlightRef.current) return;
    if (!range.since || !range.until) return;
    refreshInFlightRef.current = true;
    setRefreshing(true);
    try {
      await loadConnection(true);
      await loadRangeData(range, true);
    } catch {
      // errors surfaced through loadRangeData / loadConnection
    } finally {
      refreshInFlightRef.current = false;
      setRefreshing(false);
    }
  };

  const handleFullReport = async () => {
    if (reporting || !range.since || !range.until) return;
    setReporting(true);
    setReportMessage("Preparing full Meta report…");
    try {
      const result = await metaAdsApi.downloadFullReport(range.since, range.until, presetKey);
      setReportMessage(`Report ready · ${(result.size / (1024 * 1024)).toFixed(1)} MB`);
    } catch (err) {
      setReportMessage(err.message || "Meta report export failed.");
    } finally {
      setReporting(false);
    }
  };

  // ── drilldown ──
  const handleSelectCampaign = async (campaign) => {
    setView({ level: "adsets", campaign, adset: null });
    if (!range.since || !range.until) return;
    setDataLoading(true);
    setDataError("");
    try {
      const res = await metaAdsApi.getAdSets(campaign.id, range.since, range.until);
      setAdsets(res.adsets || []);
      setAds([]);
    } catch (err) {
      setDataError(err.message || "Failed to load ad sets");
    } finally {
      setDataLoading(false);
    }
  };

  const handleSelectAdSet = async (adset) => {
    setView({ level: "ads", campaign: view.campaign, adset });
    if (!range.since || !range.until) return;
    setDataLoading(true);
    setDataError("");
    try {
      const res = await metaAdsApi.getAds(adset.id, range.since, range.until);
      setAds(res.ads || []);
    } catch (err) {
      setDataError(err.message || "Failed to load ads");
    } finally {
      setDataLoading(false);
    }
  };

  const handleBack = () => {
    if (view.level === "ads") {
      setView({ level: "adsets", campaign: view.campaign, adset: null });
    } else if (view.level === "adsets") {
      setView({ level: "campaigns", campaign: null, adset: null });
    }
  };

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key
      ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "name" || key === "status" ? "asc" : "desc" }));
  };

  const handlePresetChange = (e) => {
    const key = e.target.value;
    setPresetKey(key);
    if (key !== "custom") {
      setCustomRange({ since: "", until: "" });
    }
  };

  const handleCustomDate = (field) => (e) => {
    setCustomRange((prev) => ({ ...prev, [field]: e.target.value }));
  };

  // ── derived rows ──
  const topRoas = useMemo(() => topRoasIds(campaigns), [campaigns]);

  const visibleCampaigns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withCpcSignal(
      sortEntities(
        campaigns.filter((c) =>
          matchStatusFilter(c, statusFilter) &&
          (!q || String(c.name || "").toLowerCase().includes(q)) &&
          matchesPerformanceFilter(c, performanceFilter),
        ),
        sort.key,
        sort.direction,
      ),
    );
  }, [campaigns, statusFilter, search, performanceFilter, sort]);

  const visibleAdSets = useMemo(
    () => withCpcSignal(sortEntities(adsets.filter((a) => matchStatusFilter(a, statusFilter) && matchesPerformanceFilter(a, performanceFilter)), sort.key, sort.direction)),
    [adsets, statusFilter, performanceFilter, sort],
  );

  const visibleAds = useMemo(
    () => withCpcSignal(sortEntities(ads.filter((a) => matchStatusFilter(a, statusFilter) && matchesPerformanceFilter(a, performanceFilter)), sort.key, sort.direction)),
    [ads, statusFilter, performanceFilter, sort],
  );

  const renderSignals = (row) => {
    const signals = computeSignals(row, { topRoasIds: topRoas });
    if (signals.length === 0) return <span className="meta-no-signal">—</span>;
    return (
      <span className="meta-signal-group">
        {signals.map((s) => <MetaSignalTag key={s.key} signal={s} />)}
      </span>
    );
  };

  const renderMoney = (value) => formatMoneyForCurrency(value, currency, { maximumFractionDigits: 0 });
  const renderDecimal = (value, digits = 2) => {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n.toFixed(digits) : "0.00";
  };

  // ── render states ──
  if (connectionLoading) {
    return (
      <div className="dashboard-feature">
        <div className="feature-header">
          <div>
            <h2 className="feature-title">Meta Ads Dashboard</h2>
            <p className="feature-subtitle">Read-only campaign, ad set and ad analytics</p>
          </div>
        </div>
        <div className="meta-state-box">CONNECTING TO META ADS…</div>
      </div>
    );
  }

  if (!connection.ok && !isErrorConnectionStatus(connection.status) && connection.status === "NOT_CONFIGURED") {
    return (
      <div className="dashboard-feature">
        <div className="feature-header">
          <div>
            <h2 className="feature-title">Meta Ads Dashboard</h2>
            <p className="feature-subtitle">Read-only campaign, ad set and ad analytics</p>
          </div>
        </div>
        <div className="meta-state-box meta-state-box--not-configured">
          <h3>META ADS NOT CONFIGURED</h3>
          <p>The Meta Ads dashboard is ready but the server has no Meta credentials configured.</p>
          <div className="meta-config-requirements">
            <h4>Required server environment variables</h4>
            <ul>
              <li><code>META_ACCESS_TOKEN</code> — Meta Marketing API access token with <code>ads_read</code> / <code>read_insights</code> permissions</li>
              <li><code>META_AD_ACCOUNT_ID</code> — numeric Meta ad account ID</li>
              <li><code>META_API_VERSION</code> — optional, defaults to <code>v26.0</code></li>
            </ul>
            <p className="meta-state-note">Tokens stay on the backend and are never exposed to this dashboard.</p>
          </div>
          <button type="button" className="button compact secondary" onClick={() => loadConnection(true)}>
            Re-check Connection
          </button>
        </div>
      </div>
    );
  }

  if (!connection.ok && isErrorConnectionStatus(connection.status)) {
    return (
      <div className="dashboard-feature">
        <div className="feature-header">
          <div>
            <h2 className="feature-title">Meta Ads Dashboard</h2>
            <p className="feature-subtitle">Read-only campaign, ad set and ad analytics</p>
          </div>
        </div>
        <div className="meta-state-box meta-state-box--error">
          <h3>{connectionStateLabel(connection.status)}</h3>
          <p>{connection.error || "Meta Ads could not be reached. Check the server logs for details."}</p>
          {connection.status === "RATE_LIMITED" ? (
            <p className="meta-state-note">Meta rate-limited the request. Wait briefly before retrying.</p>
          ) : null}
          {connection.status === "INSUFFICIENT_PERMISSIONS" ? (
            <p className="meta-state-note">Grant <code>ads_read</code> and <code>read_insights</code> to the token's system user.</p>
          ) : null}
          <button type="button" className="button compact secondary" onClick={() => loadConnection(true)}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Connected state
  const isCampaignView = view.level === "campaigns";
  const isAdSetView = view.level === "adsets";
  const isAdView = view.level === "ads";
  const rows = isCampaignView ? visibleCampaigns : isAdSetView ? visibleAdSets : visibleAds;
  const summaryInsights = summary?.insights || {};

  return (
    <div className="dashboard-feature meta-dashboard">
      <div className="feature-header">
        <div>
          <h2 className="feature-title">Meta Ads Dashboard</h2>
          <p className="feature-subtitle">
            Read-only analytics · Account: {connection?.account?.name || connection?.account?.id || "—"} · Currency: {currency} · Timezone: {timezone || "—"}
          </p>
        </div>
        <div className="meta-header-actions">
          <span className="status-chip meta-state-chip">{connectionStateLabel(connection.status)}</span>
          <button
            type="button"
            className="button compact"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "REFRESHING…" : "Refresh Meta Data"}
          </button>
          <button
            type="button"
            className="button compact secondary"
            onClick={handleFullReport}
            disabled={reporting || !range.since || !range.until}
            title="Export the full configured Meta ad account for the selected date range"
          >
            {reporting ? "PREPARING REPORT…" : "Download Full Report"}
          </button>
        </div>
      </div>

      {reportMessage ? <div className="meta-report-status" role="status">{reportMessage}</div> : null}

      {dataError ? (
        <div className="error-banner">
          <strong>META ADS DATA ERROR</strong> · {dataError}
        </div>
      ) : null}

      {/* KPI cards */}
      <div className="meta-kpi-grid">
        <MetaMoneyKpiCard label="SPEND" value={summaryInsights.spend} currency={currency} />
        <MetaKpiCard label="PURCHASES" value={formatCount(summaryInsights.purchases)} />
        <MetaMoneyKpiCard label="COST PER PURCHASE" value={summaryInsights.costPerPurchase} currency={currency} placeholder="—" />
        <MetaMoneyKpiCard label="META PURCHASE VALUE" value={summaryInsights.purchaseValue} currency={currency} />
        <MetaKpiCard label="META ROAS" value={renderDecimal(summaryInsights.purchaseRoas)} detail="Purchase value ÷ spend" tone={summaryInsights.purchaseRoas > 0 ? "success" : "default"} />
        <MetaKpiCard label="IMPRESSIONS" value={formatCount(summaryInsights.impressions)} />
        <MetaKpiCard label="CLICKS" value={formatCount(summaryInsights.clicks)} />
        <MetaKpiCard label="CTR" value={`${renderDecimal(summaryInsights.ctr)}%`} detail={`CPC ${renderMoney(summaryInsights.cpc)} · CPM ${renderMoney(summaryInsights.cpm)}`} />
      </div>

      {/* Date range + filters */}
      <div className="meta-toolbar">
        <label className="meta-toolbar-item">
          <span>Date Range</span>
          <select value={presetKey} onChange={handlePresetChange}>
            {[["today", "Today"], ["yesterday", "Yesterday"], ["last7", "Last 7 Days"], ["last14", "Last 14 Days"], ["last30", "Last 30 Days"], ["custom", "Custom"]].map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </label>
        {presetKey === "custom" ? (
          <>
            <label className="meta-toolbar-item">
              <span>From</span>
              <input type="date" value={customRange.since} onChange={handleCustomDate("since")} />
            </label>
            <label className="meta-toolbar-item">
              <span>To</span>
              <input type="date" value={customRange.until} onChange={handleCustomDate("until")} />
            </label>
            {customRangeError ? (
              <span className="meta-range-error" style={{ color: "var(--danger)", fontSize: "0.85rem", alignSelf: "center" }}>
                {customRangeError}
              </span>
            ) : null}
          </>
        ) : (
          <span className="meta-range-summary">
            {formatFriendlyDate(range.since)} – {formatFriendlyDate(range.until)} · {presetLabel(presetKey)}
          </span>
        )}
        <label className="meta-toolbar-item">
          <span>Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTERS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <label className="meta-toolbar-item">
          <span>Performance</span>
          <select value={performanceFilter} onChange={(e) => setPerformanceFilter(e.target.value)}>
            {META_PERFORMANCE_FILTERS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
        </label>
        {isCampaignView ? (
          <label className="meta-toolbar-item meta-toolbar-search">
            <span>Search</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Campaign name…"
            />
          </label>
        ) : null}
      </div>

      {/* Breadcrumb / drilldown navigation */}
      <div className="meta-breadcrumb">
        {!isCampaignView ? (
          <button type="button" className="meta-back-button" onClick={handleBack}>← Back</button>
        ) : null}
        <span className={isCampaignView ? "meta-crumb meta-crumb--active" : "meta-crumb"}>Campaigns</span>
        {isAdSetView || isAdView ? (
          <span className="meta-crumb-sep">/</span>
        ) : null}
        {isAdSetView || isAdView ? (
          <button type="button" className="meta-crumb meta-crumb--link" onClick={handleBack}>
            {view.campaign?.name || "Campaign"}
          </button>
        ) : null}
        {isAdView ? <span className="meta-crumb-sep">/</span> : null}
        {isAdView ? (
          <span className="meta-crumb meta-crumb--active">Ad Sets → {view.adset?.name || "Ad Set"}</span>
        ) : null}
      </div>

      {/* Table */}
      <div className="meta-table-panel">
        <div className="meta-table-title">
          {isCampaignView ? `Campaigns (${rows.length})` : isAdSetView ? `Ad Sets (${rows.length})` : `Ads (${rows.length})`}
          {dataLoading ? <span className="meta-loading-label">LOADING…</span> : null}
        </div>
        <div className="table-container" style={{ overflowX: "auto" }}>
          {rows.length === 0 && !dataLoading ? (
            <MetaEmptyState message="No entities match the current filters/range." />
          ) : (
            <table className="data-table meta-table">
              <thead>
                <tr>
                  {META_CAMPAIGN_SORT_KEYS.map((col) => (
                    <MetaSortableTh key={col.key} label={col.label} sortKey={col.key} sort={sort} onSort={handleSort} />
                  ))}
                  <th>Signals</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const i = row.insights || {};
                  return (
                    <tr key={row.id} className="meta-row">
                      <td>
                        {isCampaignView ? (
                          <button type="button" className="meta-name-button" onClick={() => handleSelectCampaign(row)}>
                            {row.name}
                          </button>
                        ) : isAdSetView ? (
                          <button type="button" className="meta-name-button" onClick={() => handleSelectAdSet(row)}>
                            {row.name}
                          </button>
                        ) : (
                          <span>{row.name}</span>
                        )}
                      </td>
                      <td><MetaStatusBadge statusObj={row.statusDisplay} /></td>
                      <td>{renderMoney(i.spend)}</td>
                      <td>{formatCount(i.purchases)}</td>
                      <td>{i.costPerPurchase != null ? renderMoney(i.costPerPurchase) : "—"}</td>
                      <td>{renderMoney(i.purchaseValue)}</td>
                      <td>{renderDecimal(i.purchaseRoas)}</td>
                      <td>{formatCount(i.impressions)}</td>
                      <td>{formatCount(i.clicks)}</td>
                      <td>{`${renderDecimal(i.ctr)}%`}</td>
                      <td>{renderMoney(i.cpc)}</td>
                      <td>{renderMoney(i.cpm)}</td>
                      <td>{renderSignals(row)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* One trend chart */}
      {isCampaignView ? (
        <div className="meta-chart-panel">
          <div className="meta-chart-title">Daily Spend + Purchases ({formatFriendlyDate(range.since)} – {formatFriendlyDate(range.until)})</div>
          <DailyTrendChart daily={daily} currency={currency} error={dailyError} loading={dailyLoading} />
        </div>
      ) : null}
    </div>
  );
}
