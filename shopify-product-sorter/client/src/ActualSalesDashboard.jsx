import { useEffect, useMemo, useState } from "react";
import { api } from "./api";

const dayOptions = [7, 14, 30];
const exportOptions = [
  ["reconciled-orders", "Reconciled Orders"],
  ["normalized-shopify", "Normalized Shopify"],
  ["normalized-shiprocket", "Normalized Shiprocket"],
  ["brand-performance", "Brand Performance"],
  ["type-performance", "Type Performance"],
  ["color-performance", "Color Performance"],
  ["sku-performance", "SKU Performance"],
  ["courier-performance", "Courier Performance"],
  ["pincode-performance", "Pincode Performance"],
  ["state-performance", "State Performance"],
  ["city-performance", "City Performance"],
  ["payment-method-performance", "Payment Performance"],
  ["rto-analysis", "RTO Analysis"],
  ["pending-risk", "Pending Risk"],
  ["recommendations", "Recommendations"],
  ["restock-suggestions", "Restock Suggestions"],
  ["reconciliation-issues", "Reconciliation Issues"],
  ["unmatched-orders", "Unmatched Shiprocket"],
];

function formatMoney(value, currencyCode = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(Number(value || 0));
}

function actionLabel(type) {
  if (type === "shopify") return "Refresh Shopify";
  if (type === "shiprocket") return "Refresh Shiprocket";
  return "Reconcile";
}

function inferType(lineItem) {
  if (lineItem?.productType?.trim()) {
    return lineItem.productType.trim();
  }
  const title = String(lineItem?.productTitle || lineItem?.title || "").trim();
  return title.split("|").map((part) => part.trim()).filter(Boolean)[1] || title || "Unknown";
}

function inferColor(lineItem) {
  const source = `${lineItem?.productTitle || ""} ${lineItem?.variantTitle || ""}`.toLowerCase();
  for (const color of ["black", "white", "grey", "gray", "blue", "green", "red", "pink", "brown", "beige", "tan", "yellow", "cream"]) {
    if (source.includes(color)) {
      return color.replace(/\b\w/g, (char) => char.toUpperCase());
    }
  }
  return "Unknown";
}

function inferSize(lineItem) {
  const value = String(lineItem?.variantTitle || "").trim();
  if (!value || value.toLowerCase() === "default title") {
    return "Unknown";
  }
  return value.split("/").map((part) => part.trim()).filter(Boolean).pop() || value;
}

export default function ActualSalesDashboard({ sidebarBridge }) {
  const [days, setDays] = useState(30);
  const [loadingAction, setLoadingAction] = useState("");
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [performanceView, setPerformanceView] = useState("delivered");
  const [statusFilter, setStatusFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [courierFilter, setCourierFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [pincodeFilter, setPincodeFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [colorFilter, setColorFilter] = useState("all");
  const [sizeFilter, setSizeFilter] = useState("all");
  const [skuFilter, setSkuFilter] = useState("all");
  const [recommendationFilter, setRecommendationFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [exportType, setExportType] = useState("reconciled-orders");

  function pushLog(status, actionType, message) {
    sidebarBridge?.pushLog({
      module: "Actual Sales Intelligence",
      actionType,
      status,
      message,
      timestamp: new Date().toLocaleTimeString(),
    });
  }

  function syncDiagnostics(payload) {
    sidebarBridge?.updateDiagnostics({
      loadedOrders: payload.summary.shopifyBookedOrders,
      matchedOrders:
        payload.summary.shopifyBookedOrders - payload.summary.unmatchedShopifyOrders,
      deliveredOrders: payload.summary.actualDeliveredOrders,
      rtoOrders: payload.summary.rtoOrders,
      pendingOrders: payload.summary.pendingOrders,
      returnOrders: payload.summary.returnOrders,
      unmatchedShiprocketOrders: payload.summary.unmatchedShiprocketShipments,
      shiprocketStatus: payload.meta.shiprocketConfigured ? "Connected" : "Missing credentials/token",
      lastRefreshTime: new Date().toLocaleTimeString(),
      lastActionStatus: "success",
      lastError: "None",
    });
  }

  async function loadSummary(refresh = false) {
    setLoadingAction(refresh ? "reconcile" : "load");
    setError("");
    sidebarBridge?.updateDiagnostics({
      lastActionStatus: "loading",
      lastError: "None",
    });
    pushLog("LOADING", "SUMMARY", `Loading ${days}-day reconciled sales summary`);

    try {
      const payload = await api.getSalesIntelligenceSummary(days, refresh);
      setData(payload);
      syncDiagnostics(payload);
      pushLog(
        "SUCCESS",
        "SUMMARY",
        `Loaded ${payload.summary.shopifyBookedOrders} Shopify orders, ${payload.summary.actualDeliveredOrders} delivered`,
      );
    } catch (requestError) {
      const message = requestError.message || "Failed to load sales intelligence summary";
      setError(message);
      sidebarBridge?.updateDiagnostics({
        lastActionStatus: "error",
        lastError: message,
      });
      pushLog("ERROR", "SUMMARY", message);
    } finally {
      setLoadingAction("");
    }
  }

  async function runAction(type) {
    setLoadingAction(type);
    setError("");
    sidebarBridge?.updateDiagnostics({
      lastActionStatus: "loading",
      lastError: "None",
    });
    pushLog("LOADING", type.toUpperCase(), `${actionLabel(type)} for last ${days} days`);

    try {
      if (type === "shopify") {
        await api.refreshSalesIntelligenceShopify(days);
      } else if (type === "shiprocket") {
        await api.refreshSalesIntelligenceShiprocket(days);
      }

      const payload = await api.reconcileSalesIntelligence(days, false);
      setData(payload);
      syncDiagnostics(payload);
      pushLog("SUCCESS", type.toUpperCase(), `${actionLabel(type)} completed`);
    } catch (requestError) {
      const message = requestError.message || `${actionLabel(type)} failed`;
      setError(message);
      sidebarBridge?.updateDiagnostics({
        lastActionStatus: "error",
        lastError: message,
      });
      pushLog("ERROR", type.toUpperCase(), message);
    } finally {
      setLoadingAction("");
    }
  }

  useEffect(() => {
    loadSummary(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = data?.summary;
  const orders = data?.reconciledOrders || [];
  const analytics = data?.analytics || {};
  const currencyCode = orders[0]?.currencyCode || "INR";
  const paymentOptions = useMemo(
    () => ["all", ...new Set(orders.map((order) => order.paymentMethod).filter(Boolean))],
    [orders],
  );
  const courierOptions = useMemo(
    () => ["all", ...new Set(orders.map((order) => order.courierName).filter(Boolean))],
    [orders],
  );
  const stateOptions = useMemo(
    () => ["all", ...new Set(orders.map((order) => order.shippingAddress?.province).filter(Boolean))],
    [orders],
  );
  const cityOptions = useMemo(
    () => ["all", ...new Set(orders.map((order) => order.shippingAddress?.city).filter(Boolean))],
    [orders],
  );
  const pincodeOptions = useMemo(
    () => ["all", ...new Set(orders.map((order) => order.shippingAddress?.zip).filter(Boolean))],
    [orders],
  );
  const brandOptions = useMemo(
    () => ["all", ...new Set(orders.flatMap((order) => (order.lineItems || []).map((lineItem) => lineItem.vendor).filter(Boolean)))],
    [orders],
  );
  const typeOptions = useMemo(
    () => ["all", ...new Set(orders.flatMap((order) => (order.lineItems || []).map((lineItem) => inferType(lineItem)).filter(Boolean)))],
    [orders],
  );
  const colorOptions = useMemo(
    () => ["all", ...new Set(orders.flatMap((order) => (order.lineItems || []).map((lineItem) => inferColor(lineItem)).filter(Boolean)))],
    [orders],
  );
  const sizeOptions = useMemo(
    () => ["all", ...new Set(orders.flatMap((order) => (order.lineItems || []).map((lineItem) => inferSize(lineItem)).filter(Boolean)))],
    [orders],
  );
  const skuOptions = useMemo(
    () => ["all", ...new Set(orders.flatMap((order) => (order.lineItems || []).map((lineItem) => lineItem.sku).filter(Boolean)))],
    [orders],
  );
  const recommendationOptions = useMemo(
    () => ["all", ...new Set((analytics.recommendations || []).map((item) => item.recommendation).filter(Boolean))],
    [analytics.recommendations],
  );
  const unresolvedOrders = useMemo(
    () =>
      orders.filter(
        (order) => order.matchConfidence !== "high" || order.shipmentBucket === "UNMATCHED",
      ),
    [orders],
  );
  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const lineItems = order.lineItems || [];
      const matchesStatus =
        statusFilter === "all" || order.shipmentBucket === statusFilter;
      const matchesReview =
        reviewFilter === "all" ||
        (reviewFilter === "unmatched" && order.shipmentBucket === "UNMATCHED") ||
        (reviewFilter === "low-confidence" && ["none", "low", "medium"].includes(order.matchConfidence));
      const matchesPayment =
        paymentFilter === "all" || order.paymentMethod === paymentFilter;
      const matchesCourier =
        courierFilter === "all" || order.courierName === courierFilter;
      const matchesState =
        stateFilter === "all" || order.shippingAddress?.province === stateFilter;
      const matchesCity =
        cityFilter === "all" || order.shippingAddress?.city === cityFilter;
      const matchesPincode =
        pincodeFilter === "all" || order.shippingAddress?.zip === pincodeFilter;
      const matchesBrand =
        brandFilter === "all" || lineItems.some((lineItem) => (lineItem.vendor || "Unknown") === brandFilter);
      const matchesType =
        typeFilter === "all" || lineItems.some((lineItem) => inferType(lineItem) === typeFilter);
      const matchesColor =
        colorFilter === "all" || lineItems.some((lineItem) => inferColor(lineItem) === colorFilter);
      const matchesSize =
        sizeFilter === "all" || lineItems.some((lineItem) => inferSize(lineItem) === sizeFilter);
      const matchesSku =
        skuFilter === "all" || lineItems.some((lineItem) => lineItem.sku === skuFilter);
      const haystack = `${order.shopifyOrderName} ${order.awb} ${order.shiprocketStatus} ${order.paymentMethod} ${order.courierName} ${order.shippingAddress?.zip || ""} ${order.shippingAddress?.city || ""} ${order.shippingAddress?.province || ""}`.toLowerCase();
      const matchesSearch = !search || haystack.includes(search.toLowerCase());
      return matchesStatus
        && matchesReview
        && matchesPayment
        && matchesCourier
        && matchesState
        && matchesCity
        && matchesPincode
        && matchesBrand
        && matchesType
        && matchesColor
        && matchesSize
        && matchesSku
        && matchesSearch;
    });
  }, [brandFilter, cityFilter, colorFilter, courierFilter, orders, paymentFilter, pincodeFilter, reviewFilter, search, sizeFilter, skuFilter, stateFilter, statusFilter, typeFilter]);
  const filteredRecommendations = useMemo(
    () => (analytics.recommendations || []).filter((item) => recommendationFilter === "all" || item.recommendation === recommendationFilter),
    [analytics.recommendations, recommendationFilter],
  );
  const reconciliationIssueRows = useMemo(() => {
    const issues = analytics.reconciliationIssues || {};
    return [
      ...(issues.lowConfidenceMatches || []).map((row) => ({
        issueType: "Low Confidence Match",
        primary: row.shopifyOrderName,
        detail: `${row.matchType} / ${row.matchConfidence}`,
        extra: row.shiprocketStatus || "-",
      })),
      ...(issues.unmatchedShopifyOrders || []).map((row) => ({
        issueType: "Unmatched Shopify Order",
        primary: row.shopifyOrderName,
        detail: formatDate(row.processedAt),
        extra: formatMoney(row.total, currencyCode),
      })),
      ...(issues.missingAwb || []).map((row) => ({
        issueType: "Missing AWB",
        primary: row.shopifyOrderName,
        detail: row.shipmentBucket,
        extra: row.shiprocketStatus || "-",
      })),
      ...(issues.missingSku || []).map((row) => ({
        issueType: "Missing SKU",
        primary: row.shopifyOrderName,
        detail: row.productTitle,
        extra: "-",
      })),
      ...(issues.missingShipmentStatus || []).map((row) => ({
        issueType: "Missing Shipment Status",
        primary: row.shopifyOrderName,
        detail: row.shipmentBucket,
        extra: "-",
      })),
    ];
  }, [analytics.reconciliationIssues, currencyCode]);

  function unitsForView(row) {
    if (performanceView === "booked") return row.bookedUnits;
    if (performanceView === "pending") return row.pendingUnits;
    if (performanceView === "rto") return row.rtoUnits;
    if (performanceView === "returns") return row.returnUnits;
    return row.deliveredUnits;
  }

  function salesForView(row) {
    if (performanceView === "booked") return row.bookedSales;
    if (performanceView === "pending") return row.pendingSales;
    if (performanceView === "rto") return row.rtoSales;
    if (performanceView === "returns") return row.returnSales;
    return row.deliveredSales;
  }

  function viewLabel() {
    if (performanceView === "booked") return "Booked";
    if (performanceView === "pending") return "Pending";
    if (performanceView === "rto") return "RTO";
    if (performanceView === "returns") return "Returns";
    return "Delivered";
  }

  return (
    <main className="dashboard">
      <section className="topbar panel">
        <div className="topbar-header">
          <div>
            <p className="eyebrow">Sales Intelligence</p>
            <h2>Actual Sales Intelligence: Shopify + Shiprocket</h2>
          </div>
          <div className="action-row">
            <label className="actual-sales-days">
              Window
              <select
                value={days}
                onChange={(event) => setDays(Number(event.target.value))}
              >
                {dayOptions.map((option) => (
                  <option key={option} value={option}>
                    Last {option} days
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button ghost"
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => runAction("shopify")}
            >
              {loadingAction === "shopify" ? "Refreshing..." : "Refresh Shopify Data"}
            </button>
            <button
              className="button ghost"
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => runAction("shiprocket")}
            >
              {loadingAction === "shiprocket" ? "Refreshing..." : "Refresh Shiprocket Data"}
            </button>
            <button
              className="button accent"
              type="button"
              disabled={Boolean(loadingAction)}
              onClick={() => loadSummary(true)}
            >
              {loadingAction === "reconcile" ? "Reconciling..." : "Reconcile Data"}
            </button>
            <label className="actual-sales-days">
              Export
              <select
                value={exportType}
                onChange={(event) => setExportType(event.target.value)}
              >
                {exportOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <a className="button ghost" href={api.salesIntelligenceExportUrl(exportType, days)}>
              Export CSV
            </a>
            <a className="button ghost" href={api.salesIntelligenceExportUrl("reconciled-orders", days)}>
              Export Reconciled CSV
            </a>
            <a className="button ghost" href={api.salesIntelligenceExportUrl("sku-performance", days)}>
              Export SKU CSV
            </a>
            <a className="button ghost" href={api.salesIntelligenceExportUrl("restock-suggestions", days)}>
              Export Restock CSV
            </a>
          </div>
        </div>

        <div className="status-row">
          <span className="status-chip">
            Shopify: {data?.meta?.lastShopifyRefresh ? formatDate(data.meta.lastShopifyRefresh) : "Not loaded"}
          </span>
          <span className="status-chip">
            Shiprocket: {data?.meta?.lastShiprocketRefresh ? formatDate(data.meta.lastShiprocketRefresh) : "Not loaded"}
          </span>
          <span className="status-chip">
            Reconciliation: {data?.meta?.lastReconciliation ? formatDate(data.meta.lastReconciliation) : "Not run"}
          </span>
        </div>

        {data?.warnings?.length ? (
          <div className="status-row">
            {data.warnings.map((warning) => (
              <span key={warning} className="tag warning">
                {warning}
              </span>
            ))}
          </div>
        ) : null}

        {error ? (
          <div className="status-row">
            <span className="tag error">{error}</span>
          </div>
        ) : null}

        {summary ? (
          <div className="metrics-grid actual-sales-metrics">
            <article className="metric-card panel">
              <span className="metric-label">Shopify Booked Sales</span>
              <strong>{formatMoney(summary.shopifyBookedSales, currencyCode)}</strong>
              <span className="metric-meta">
                {summary.shopifyBookedOrders} orders / {summary.shopifyBookedUnits} units
              </span>
            </article>
            <article className="metric-card panel">
              <span className="metric-label">Actual Delivered Sales</span>
              <strong>{formatMoney(summary.actualDeliveredSales, currencyCode)}</strong>
              <span className="metric-meta">
                {summary.actualDeliveredOrders} orders / {summary.actualDeliveredUnits} units
              </span>
            </article>
            <article className="metric-card panel">
              <span className="metric-label">Pending Sales</span>
              <strong>{formatMoney(summary.pendingSalesValue, currencyCode)}</strong>
              <span className="metric-meta">
                {summary.pendingOrders} orders / {summary.pendingUnits} units
              </span>
            </article>
            <article className="metric-card panel">
              <span className="metric-label">RTO Sales Loss</span>
              <strong>{formatMoney(summary.rtoSalesValue, currencyCode)}</strong>
              <span className="metric-meta">
                {summary.rtoOrders} orders / {summary.rtoUnits} units
              </span>
            </article>
            <article className="metric-card panel">
              <span className="metric-label">Return Sales Loss</span>
              <strong>{formatMoney(summary.returnSalesValue, currencyCode)}</strong>
              <span className="metric-meta">
                {summary.returnOrders} orders / {summary.returnUnits} units
              </span>
            </article>
            <article className="metric-card panel">
              <span className="metric-label">True Net Sales</span>
              <strong>{formatMoney(summary.trueNetSales, currencyCode)}</strong>
              <span className="metric-meta">
                Refunds {formatMoney(summary.refundedAmount, currencyCode)}
              </span>
            </article>
            <article className="metric-card panel">
              <span className="metric-label">Delivery Success %</span>
              <strong>{formatPercent(summary.deliverySuccessRate)}</strong>
              <span className="metric-meta">Delivered / shipped</span>
            </article>
            <article className="metric-card panel">
              <span className="metric-label">RTO Rate %</span>
              <strong>{formatPercent(summary.rtoRate)}</strong>
              <span className="metric-meta">RTO / shipped</span>
            </article>
            <article className="metric-card panel">
              <span className="metric-label">Return Rate %</span>
              <strong>{formatPercent(summary.returnRate)}</strong>
              <span className="metric-meta">Returns / delivered</span>
            </article>
            <article className="metric-card panel">
              <span className="metric-label">Unmatched Shopify Orders</span>
              <strong>{summary.unmatchedShopifyOrders}</strong>
              <span className="metric-meta">Needs manual review</span>
            </article>
            <article className="metric-card panel">
              <span className="metric-label">Unmatched Shiprocket Shipments</span>
              <strong>{summary.unmatchedShiprocketShipments}</strong>
              <span className="metric-meta">No Shopify match found</span>
            </article>
          </div>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-heading actual-sales-heading">
          <div>
            <p className="eyebrow">Formal Summary</p>
            <h3>Business readout</h3>
          </div>
        </div>
        <div className="summary-copy">
          {analytics.formalSummary || "Reconcile data to generate the formal summary."}
        </div>
      </section>

      <section className="content-grid actual-sales-content-grid">
        <div className="panel">
          <div className="section-heading actual-sales-heading">
            <div>
              <p className="eyebrow">Recommendations</p>
              <h3>Buy more / buy less</h3>
            </div>
            <label className="actual-sales-days">
              Recommendation
              <select value={recommendationFilter} onChange={(event) => setRecommendationFilter(event.target.value)}>
                {recommendationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "All" : option}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Recommendation</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecommendations.length ? (
                  filteredRecommendations.map((item) => (
                    <tr key={`${item.sku}-${item.recommendation}`}>
                      <td>{item.sku}</td>
                      <td>{item.productTitle}</td>
                      <td>{item.recommendation}</td>
                      <td>{item.reason}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="empty-state-cell">No recommendation output yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="section-heading actual-sales-heading">
            <div>
              <p className="eyebrow">Pending Risk</p>
              <h3>At-risk orders</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Status</th>
                  <th>Courier</th>
                  <th>Days</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.pendingRisk || []).length ? (
                  analytics.pendingRisk.slice(0, 10).map((item) => (
                    <tr key={`${item.order}-${item.awb}`}>
                      <td>{item.order}</td>
                      <td>{item.status}</td>
                      <td>{item.courier}</td>
                      <td>{item.daysSinceOrder}</td>
                      <td>{item.riskLevel}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="5" className="empty-state-cell">No pending-risk rows in this window.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="content-grid actual-sales-content-grid">
        <div className="panel">
          <div className="section-heading actual-sales-heading">
            <div>
              <p className="eyebrow">Brand Performance</p>
              <h3>Performance tables</h3>
            </div>
            <label className="actual-sales-inline-filter">
              View By
              <select value={performanceView} onChange={(event) => setPerformanceView(event.target.value)}>
                <option value="delivered">Actual Delivered Sales</option>
                <option value="booked">Shopify Booked Sales</option>
                <option value="pending">Pending</option>
                <option value="rto">RTO</option>
                <option value="returns">Returns</option>
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Brand</th>
                  <th>{viewLabel()} Units</th>
                  <th>{viewLabel()} Sales</th>
                  <th>Pending Units</th>
                  <th>RTO %</th>
                  <th>True Net</th>
                  <th>Reco</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.brandPerformance || []).slice(0, 10).map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{formatNumber(unitsForView(row))}</td>
                    <td>{formatMoney(salesForView(row), currencyCode)}</td>
                    <td>{formatNumber(row.pendingUnits)}</td>
                    <td>{formatPercent(row.rtoRate)}</td>
                    <td>{formatMoney(row.trueNetSales, currencyCode)}</td>
                    <td>{row.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="section-heading actual-sales-heading">
            <div>
              <p className="eyebrow">Type Performance</p>
              <h3>Delivered vs losses</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>{viewLabel()} Units</th>
                  <th>{viewLabel()} Sales</th>
                  <th>RTO %</th>
                  <th>Return %</th>
                  <th>Days Cover</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.typePerformance || []).slice(0, 10).map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{formatNumber(unitsForView(row))}</td>
                    <td>{formatMoney(salesForView(row), currencyCode)}</td>
                    <td>{formatPercent(row.rtoRate)}</td>
                    <td>{formatPercent(row.returnRate)}</td>
                    <td>{Math.round(row.daysOfCover)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="content-grid actual-sales-content-grid">
        <div className="panel">
          <div className="section-heading actual-sales-heading">
            <div>
              <p className="eyebrow">Color Performance</p>
              <h3>Delivered by color</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Color</th>
                  <th>{viewLabel()} Units</th>
                  <th>{viewLabel()} Sales</th>
                  <th>Pending Units</th>
                  <th>RTO %</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.colorPerformance || []).slice(0, 10).map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{formatNumber(unitsForView(row))}</td>
                    <td>{formatMoney(salesForView(row), currencyCode)}</td>
                    <td>{formatNumber(row.pendingUnits)}</td>
                    <td>{formatPercent(row.rtoRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="section-heading actual-sales-heading">
            <div>
              <p className="eyebrow">Courier Performance</p>
              <h3>Delivery health by courier</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Courier</th>
                  <th>Total</th>
                  <th>Delivered</th>
                  <th>Pending</th>
                  <th>RTO %</th>
                  <th>Avg Days</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.courierPerformance || []).slice(0, 10).map((row) => (
                  <tr key={row.courier}>
                    <td>{row.courier}</td>
                    <td>{formatNumber(row.totalShipments)}</td>
                    <td>{formatNumber(row.deliveredShipments)}</td>
                    <td>{formatNumber(row.pendingShipments)}</td>
                    <td>{formatPercent(row.rtoRate)}</td>
                    <td>{Math.round(row.averageDeliveryDays || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading actual-sales-heading">
          <div>
            <p className="eyebrow">Payment Method</p>
            <h3>COD vs prepaid performance</h3>
          </div>
          <a className="button ghost" href={api.salesIntelligenceExportUrl("payment-method-performance", days)}>
            Export Payment CSV
          </a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Method</th>
                <th>Orders</th>
                <th>Delivered</th>
                <th>Pending</th>
                <th>RTO</th>
                <th>Delivered Sales</th>
                <th>RTO %</th>
              </tr>
            </thead>
            <tbody>
              {(analytics.paymentMethodPerformance || []).length ? (
                analytics.paymentMethodPerformance.map((row) => (
                  <tr key={row.paymentMethod}>
                    <td>{row.paymentMethod}</td>
                    <td>{formatNumber(row.orders)}</td>
                    <td>{formatNumber(row.deliveredOrders)}</td>
                    <td>{formatNumber(row.pendingOrders)}</td>
                    <td>{formatNumber(row.rtoOrders)}</td>
                    <td>{formatMoney(row.deliveredSales, currencyCode)}</td>
                    <td>{formatPercent(row.rtoRate)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="empty-state-cell">No payment-method rows in this window.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading actual-sales-heading">
          <div>
            <p className="eyebrow">Pincode Performance</p>
            <h3>Geography risk view</h3>
          </div>
          <a className="button ghost" href={api.salesIntelligenceExportUrl("pincode-performance", days)}>
            Export Pincode CSV
          </a>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pincode</th>
                <th>State</th>
                <th>City</th>
                <th>Orders</th>
                <th>Delivered</th>
                <th>Pending</th>
                <th>RTO %</th>
                <th>Top Brand</th>
                <th>Top Type</th>
                <th>Courier Split</th>
              </tr>
            </thead>
            <tbody>
              {(analytics.pincodePerformance || []).slice(0, 15).map((row) => (
                <tr key={`${row.pincode}-${row.city}`}>
                  <td>{row.pincode}</td>
                  <td>{row.state}</td>
                  <td>{row.city}</td>
                  <td>{formatNumber(row.orders)}</td>
                  <td>{formatNumber(row.delivered)}</td>
                  <td>{formatNumber(row.pending)}</td>
                  <td>{formatPercent(row.rtoRate)}</td>
                  <td>{row.topBrand}</td>
                  <td>{row.topType}</td>
                  <td>{row.courierSplit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-grid actual-sales-content-grid">
        <div className="panel">
          <div className="section-heading actual-sales-heading">
            <div>
              <p className="eyebrow">State Performance</p>
              <h3>State-level delivery view</h3>
            </div>
            <a className="button ghost" href={api.salesIntelligenceExportUrl("state-performance", days)}>
              Export State CSV
            </a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>State</th>
                  <th>Orders</th>
                  <th>Delivered</th>
                  <th>Pending</th>
                  <th>RTO %</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.statePerformance || []).slice(0, 10).map((row) => (
                  <tr key={row.state}>
                    <td>{row.state}</td>
                    <td>{formatNumber(row.orders)}</td>
                    <td>{formatNumber(row.delivered)}</td>
                    <td>{formatNumber(row.pending)}</td>
                    <td>{formatPercent(row.rtoRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="section-heading actual-sales-heading">
            <div>
              <p className="eyebrow">City Performance</p>
              <h3>City-level delivery view</h3>
            </div>
            <a className="button ghost" href={api.salesIntelligenceExportUrl("city-performance", days)}>
              Export City CSV
            </a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>City</th>
                  <th>State</th>
                  <th>Orders</th>
                  <th>Delivered</th>
                  <th>RTO %</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.cityPerformance || []).slice(0, 10).map((row, index) => (
                  <tr key={`${row.state}-${row.city}-${index}`}>
                    <td>{row.city}</td>
                    <td>{row.state}</td>
                    <td>{formatNumber(row.orders)}</td>
                    <td>{formatNumber(row.delivered)}</td>
                    <td>{formatPercent(row.rtoRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading actual-sales-heading">
          <div>
            <p className="eyebrow">SKU Performance</p>
            <h3>Delivered-first SKU table</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th>Brand</th>
                  <th>Color</th>
                  <th>{viewLabel()} Units</th>
                  <th>{viewLabel()} Sales</th>
                  <th>RTO %</th>
                  <th>Reco</th>
                </tr>
            </thead>
            <tbody>
              {(analytics.skuPerformance || []).slice(0, 15).map((row) => (
                <tr key={row.sku}>
                  <td>{row.sku}</td>
                  <td>{row.productTitle}</td>
                  <td>{row.brand}</td>
                  <td>{row.color}</td>
                  <td>{formatNumber(unitsForView(row))}</td>
                  <td>{formatMoney(salesForView(row), currencyCode)}</td>
                  <td>{formatPercent(row.rtoRate)}</td>
                  <td>{row.recommendation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="content-grid actual-sales-content-grid">
        <div className="panel">
          <div className="section-heading actual-sales-heading">
            <div>
              <p className="eyebrow">RTO Analysis</p>
              <h3>Top RTO breakdowns</h3>
            </div>
            <a className="button ghost" href={api.salesIntelligenceExportUrl("rto-analysis", days)}>
              Export RTO CSV
            </a>
          </div>
          <div className="content-grid actual-sales-content-grid">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>RTO Units</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics.rtoAnalysis?.bySku || []).length ? (
                    analytics.rtoAnalysis.bySku.slice(0, 10).map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{formatNumber(row.rtoUnits)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="2" className="empty-state-cell">No RTO rows in this window.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Courier</th>
                    <th>RTO Units</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics.rtoAnalysis?.byCourier || []).length ? (
                    analytics.rtoAnalysis.byCourier.slice(0, 10).map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{formatNumber(row.rtoUnits)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="2" className="empty-state-cell">No courier RTO rows.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="content-grid actual-sales-content-grid">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Brand</th>
                    <th>RTO Units</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics.rtoAnalysis?.byBrand || []).length ? (
                    analytics.rtoAnalysis.byBrand.slice(0, 10).map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{formatNumber(row.rtoUnits)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="2" className="empty-state-cell">No brand RTO rows.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pincode</th>
                    <th>RTO Units</th>
                  </tr>
                </thead>
                <tbody>
                  {(analytics.rtoAnalysis?.byPincode || []).length ? (
                    analytics.rtoAnalysis.byPincode.slice(0, 10).map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{formatNumber(row.rtoUnits)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="2" className="empty-state-cell">No pincode RTO rows.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="section-heading actual-sales-heading">
            <div>
              <p className="eyebrow">Restock Suggestions</p>
              <h3>Delivered-velocity based</h3>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Delivered Units</th>
                  <th>Inventory</th>
                  <th>RTO %</th>
                  <th>Suggested</th>
                  <th>Adjusted</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.restockSuggestions || []).length ? (
                  analytics.restockSuggestions.slice(0, 15).map((row) => (
                    <tr key={row.sku}>
                      <td>{row.sku}</td>
                      <td>{formatNumber(row.deliveredUnits)}</td>
                      <td>{formatNumber(row.currentInventory)}</td>
                      <td>{formatPercent(row.rtoRate)}</td>
                      <td>{formatNumber(row.suggestedRestockQty)}</td>
                      <td>{formatNumber(row.adjustedRestockQty)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="empty-state-cell">No restock suggestions in this window.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading actual-sales-heading">
          <div>
            <p className="eyebrow">Reconciliation Trust</p>
            <h3>Unresolved review queue</h3>
          </div>
          <a className="button ghost" href={api.salesIntelligenceExportUrl("reconciliation-issues", days)}>
            Export Issues CSV
          </a>
        </div>
        <div className="metrics-grid actual-sales-mini-metrics">
          <article className="metric-card panel">
            <span className="metric-label">Low Confidence Matches</span>
            <strong>{formatNumber(analytics.reconciliationIssues?.summary?.lowConfidenceMatches || 0)}</strong>
          </article>
          <article className="metric-card panel">
            <span className="metric-label">Unmatched Shopify Orders</span>
            <strong>{formatNumber(analytics.reconciliationIssues?.summary?.unmatchedShopifyOrders || 0)}</strong>
          </article>
          <article className="metric-card panel">
            <span className="metric-label">Unmatched Shiprocket Rows</span>
            <strong>{formatNumber((data?.unmatchedShiprocketOrders || []).length)}</strong>
          </article>
          <article className="metric-card panel">
            <span className="metric-label">Missing AWB</span>
            <strong>{formatNumber(analytics.reconciliationIssues?.summary?.missingAwb || 0)}</strong>
          </article>
          <article className="metric-card panel">
            <span className="metric-label">Missing SKU</span>
            <strong>{formatNumber(analytics.reconciliationIssues?.summary?.missingSku || 0)}</strong>
          </article>
          <article className="metric-card panel">
            <span className="metric-label">Missing Shipment Status</span>
            <strong>{formatNumber(analytics.reconciliationIssues?.summary?.missingShipmentStatus || 0)}</strong>
          </article>
        </div>
        <div className="table-wrap actual-sales-issues-table">
          <table>
            <thead>
              <tr>
                <th>Issue Type</th>
                <th>Primary</th>
                <th>Detail</th>
                <th>Extra</th>
              </tr>
            </thead>
            <tbody>
              {reconciliationIssueRows.length ? (
                reconciliationIssueRows.slice(0, 20).map((row, index) => (
                  <tr key={`${row.issueType}-${row.primary}-${index}`}>
                    <td>{row.issueType}</td>
                    <td>{row.primary}</td>
                    <td>{row.detail}</td>
                    <td>{row.extra}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="empty-state-cell">No reconciliation issues in this window.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading actual-sales-heading">
          <div>
            <p className="eyebrow">Reconciliation</p>
            <h3>Shopify vs Shiprocket orders</h3>
          </div>
          <p className="metric-meta">
            Match order name first, then AWB, then phone + amount + date fallback.
          </p>
        </div>

        <div className="filters-grid actual-sales-filter-grid">
          <label>
            Shipment Bucket
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="DELIVERED">Delivered</option>
              <option value="PICKUP_PENDING">Pickup Pending</option>
              <option value="IN_TRANSIT">In Transit</option>
              <option value="NDR">NDR</option>
              <option value="RTO">RTO</option>
              <option value="RETURN">Return</option>
              <option value="UNMATCHED">Unmatched</option>
            </select>
          </label>
          <label>
            Review Queue
            <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="low-confidence">Low Confidence</option>
              <option value="unmatched">Unmatched Only</option>
            </select>
          </label>
          <label>
            Brand
            <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}>
              {brandOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Product Type
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Color
            <select value={colorFilter} onChange={(event) => setColorFilter(event.target.value)}>
              {colorOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Size
            <select value={sizeFilter} onChange={(event) => setSizeFilter(event.target.value)}>
              {sizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
          </label>
          <label>
            SKU
            <select value={skuFilter} onChange={(event) => setSkuFilter(event.target.value)}>
              {skuOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Payment
            <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value)}>
              {paymentOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Courier
            <select value={courierFilter} onChange={(event) => setCourierFilter(event.target.value)}>
              {courierOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
          </label>
          <label>
            State
            <select value={stateFilter} onChange={(event) => setStateFilter(event.target.value)}>
              {stateOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
          </label>
          <label>
            City
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
              {cityOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pincode
            <select value={pincodeFilter} onChange={(event) => setPincodeFilter(event.target.value)}>
              {pincodeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All" : option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search / Pincode
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Order / AWB / status / pincode"
            />
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Processed</th>
                <th>Booked</th>
                <th>Refunded</th>
                <th>Bucket</th>
                <th>Shiprocket</th>
                <th>Match</th>
                <th>AWB</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length ? (
                filteredOrders.map((order) => (
                  <tr key={order.shopifyOrderId}>
                    <td>
                      <div className="order-cell">
                        <strong>{order.shopifyOrderName}</strong>
                        <span className="muted">
                          {order.financialStatus} / {order.fulfillmentStatus}
                        </span>
                      </div>
                    </td>
                    <td>{formatDate(order.processedAt || order.createdAt)}</td>
                    <td>{formatMoney(order.total, order.currencyCode)}</td>
                    <td>{formatMoney(order.refundedAmount, order.currencyCode)}</td>
                    <td>
                      <span className={`tag actual-status ${String(order.shipmentBucket || "").toLowerCase()}`}>
                        {order.shipmentBucket.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>{order.shiprocketStatus}</td>
                    <td>{order.matchType} / {order.matchConfidence}</td>
                    <td>{order.awb || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="empty-state-cell">
                    {loadingAction ? "Loading orders..." : "No reconciled orders match the current filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="section-heading actual-sales-heading">
          <div>
            <p className="eyebrow">Unmatched Shiprocket</p>
            <h3>Shipments needing Shopify linkage</h3>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Channel Order</th>
                <th>Status</th>
                <th>Total</th>
                <th>Phone</th>
              </tr>
            </thead>
            <tbody>
              {(data?.unmatchedShiprocketOrders || []).length ? (
                data.unmatchedShiprocketOrders.slice(0, 15).map((row) => (
                  <tr key={row.shiprocketOrderId}>
                    <td>{row.channelOrderId}</td>
                    <td>{row.status}</td>
                    <td>{formatMoney(row.total, currencyCode)}</td>
                    <td>{row.customerPhone || "-"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="empty-state-cell">No unmatched Shiprocket rows in this window.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
