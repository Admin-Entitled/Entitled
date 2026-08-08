import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./orderMappingApi";
import { OrderCard, MetricCard, OrderTable } from "./OrderMappingComponents.jsx";
import {
  getStatusFilterLabel,
  readOrdersPayload,
} from "./orderMappingView";
import { formatCount, formatCurrency } from "./utils/format.js";
import "./orderMapping.css";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const FALLBACK_ERROR = "We couldn't load Shopify orders right now. Please try again.";
const TODAY = new Date().toISOString().slice(0, 10);

let pendingOrdersPromise = null;
let pendingOrdersKey = "";

function loadShopifyOrders({ status, page, pageSize, startDate, endDate }) {
  const requestKey = JSON.stringify({
    status: status || "ALL",
    page,
    pageSize,
    startDate: startDate || "",
    endDate: endDate || "",
  });
  if (!pendingOrdersPromise || pendingOrdersKey !== requestKey) {
    pendingOrdersKey = requestKey;
    pendingOrdersPromise = api
      .orders({
        page,
        pageSize,
        status: status || "ALL",
        startDate: startDate || "",
        endDate: endDate || "",
      })
      .finally(() => {
        pendingOrdersPromise = null;
        pendingOrdersKey = "";
      });
  }

  return pendingOrdersPromise;
}

export default function OrderMapping() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState("");
  const [dateStartInput, setDateStartInput] = useState("");
  const [dateEndInput, setDateEndInput] = useState("");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [statusOptions, setStatusOptions] = useState(["ALL"]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [deliveredAmountTotal, setDeliveredAmountTotal] = useState("0");
  const syncInFlightRef = useRef(false);

  function applyOrdersPayload(payload) {
    const next = readOrdersPayload(payload);
    setOrders(next.orders);
    setTotal(next.total);
    setStatusOptions(next.statuses);
    setPage(next.page);
    setDeliveredAmountTotal(next.deliveredAmountTotal);
  }

  async function refreshOrders(next = {}) {
    pendingOrdersPromise = null;
    pendingOrdersKey = "";
    const payload = await loadShopifyOrders({
      status: next.status || statusFilter,
      page: next.page || page,
      pageSize: next.pageSize || pageSize,
      startDate: next.startDate ?? appliedStartDate,
      endDate: next.endDate ?? appliedEndDate,
    });
    applyOrdersPayload(payload);
  }

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError("");

    loadShopifyOrders({
      status: statusFilter,
      page,
      pageSize,
      startDate: appliedStartDate,
      endDate: appliedEndDate,
    })
      .then((payload) => {
        if (!cancelled) {
          applyOrdersPayload(payload);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(FALLBACK_ERROR);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [statusFilter, page, pageSize, appliedStartDate, appliedEndDate]);

  const hasDraftDateRange = Boolean(dateStartInput || dateEndInput);
  const hasAppliedDateRange = Boolean(appliedStartDate && appliedEndDate);
  const hasPendingDateChange =
    dateStartInput !== appliedStartDate || dateEndInput !== appliedEndDate;

  function applyDateRange() {
    if ((dateStartInput && !dateEndInput) || (!dateStartInput && dateEndInput)) {
      setSyncError("Select both a start date and an end date.");
      return;
    }

    if (dateStartInput && dateEndInput && dateStartInput > dateEndInput) {
      setSyncError("Start date must be before end date.");
      return;
    }

    setSyncError("");
    setAppliedStartDate(dateStartInput);
    setAppliedEndDate(dateEndInput);
    setPage(1);
  }

  function clearDateRange() {
    setSyncError("");
    setDateStartInput("");
    setDateEndInput("");
    setAppliedStartDate("");
    setAppliedEndDate("");
    setPage(1);
  }

  async function handleSync() {
    if (syncInFlightRef.current) {
      return;
    }

    if ((dateStartInput && !dateEndInput) || (!dateStartInput && dateEndInput)) {
      setSyncError("Select both a start date and an end date for sync.");
      return;
    }

    syncInFlightRef.current = true;
    setSyncing(true);
    setSyncError("");
    setSyncMessage(
      dateStartInput && dateEndInput
        ? `Sync started for ${dateStartInput} to ${dateEndInput}. Shopify orders and Shiprocket statuses are refreshing.`
        : "Sync started. Shopify orders and Shiprocket statuses are refreshing.",
    );
    let refreshTimer;
    let stopTimer;

    try {
      refreshTimer = window.setInterval(() => {
        refreshOrders().catch(() => {});
      }, 5000);
      stopTimer = window.setTimeout(() => {
        window.clearInterval(refreshTimer);
      }, 30000);

      const syncResult = await api.syncShopify(dateStartInput && dateEndInput ? { start: dateStartInput, end: dateEndInput } : {});
      await refreshOrders({
        startDate: appliedStartDate,
        endDate: appliedEndDate,
      });
      
      if (syncResult && syncResult.status === "partially_completed") {
        setSyncMessage(
          `SYNC COMPLETED WITH WARNINGS: ${syncResult.ordersFetched || 0} orders processed, ${syncResult.tracking?.updated || 0} updated, ${syncResult.tracking?.failed || 0} require attention.`
        );
      } else if (syncResult) {
        setSyncMessage(
          `Sync completed successfully: ${syncResult.ordersFetched || 0} orders processed, ${syncResult.tracking?.updated || 0} updated, ${syncResult.tracking?.skippedTerminal || 0} skipped terminal.`
        );
      } else {
        setSyncMessage("Sync finished.");
      }
      setSyncError("");
    } catch (err) {
      const code = err.code || "SYNC_FAILED";
      const message = err.message || "Please try again.";
      setSyncError(`${code}: ${message}`);
    } finally {
      window.clearInterval(refreshTimer);
      window.clearTimeout(stopTimer);
      syncInFlightRef.current = false;
      setSyncing(false);
    }
  }

  const emptyState = useMemo(() => {
    if (loading) {
      return null;
    }
    if (error) {
      return FALLBACK_ERROR;
    }
    if (!orders.length) {
      return "No Shopify orders found.";
    }
    return "";
  }, [error, loading, orders.length]);

  const pageAmount = useMemo(
    () =>
      orders.reduce((sum, order) => {
        const amount = Number.parseFloat(order.order_amount || 0);
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0),
    [orders],
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const deliveredLabel = hasAppliedDateRange
    ? `Delivered total (${appliedStartDate} to ${appliedEndDate})`
    : "Delivered total";

  return (
    <main className="order-mapping-page order-mapping-viewer">
      <section className="order-mapping-shell">
        <header className="order-mapping-header">
          <div>
            <p className="order-mapping-eyebrow">Order Mapping</p>
            <h1>Shopify Orders</h1>
            <p className="order-mapping-count" aria-live="polite">
              {loading ? "Loading orders…" : `${formatCount(total)} orders`}
            </p>
          </div>

          <div className="order-mapping-header-actions">
            <label className="order-mapping-date-field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
                disabled={loading || syncing}
              >
                {statusOptions.map((status) => (
                  <option key={status} value={status}>
                    {getStatusFilterLabel(status)}
                  </option>
                ))}
              </select>
            </label>
            <label className="order-mapping-date-field">
              <span>From</span>
              <input
                type="date"
                value={dateStartInput}
                max={TODAY}
                onChange={(event) => {
                  setDateStartInput(event.target.value);
                }}
                disabled={syncing}
              />
            </label>
            <label className="order-mapping-date-field">
              <span>To</span>
              <input
                type="date"
                value={dateEndInput}
                max={TODAY}
                onChange={(event) => {
                  setDateEndInput(event.target.value);
                }}
                disabled={syncing}
              />
            </label>
            <div className="order-mapping-range-actions">
              <button
                type="button"
                className="order-mapping-page-button order-mapping-page-button--secondary"
                onClick={applyDateRange}
                disabled={syncing || !hasPendingDateChange}
              >
                Apply range
              </button>
              <button
                type="button"
                className="order-mapping-page-button order-mapping-page-button--ghost"
                onClick={clearDateRange}
                disabled={syncing || !hasDraftDateRange}
              >
                Clear
              </button>
            </div>
            <button
              type="button"
              className="order-mapping-sync-button"
              onClick={handleSync}
              disabled={loading || syncing}
            >
              {syncing ? "Syncing…" : "Sync"}
            </button>
          </div>
        </header>

        <section className="order-mapping-metrics" aria-label="Order summary">
          <MetricCard
            label="Total orders"
            value={loading ? "Loading…" : formatCount(total)}
            detail={
              hasAppliedDateRange
                ? `${statusFilter === "ALL" ? "All statuses" : getStatusFilterLabel(statusFilter)} · filtered range`
                : statusFilter === "ALL"
                  ? "For current result set"
                  : getStatusFilterLabel(statusFilter)
            }
            tone="primary"
          />
          <MetricCard
            label={deliveredLabel}
            value={loading ? "Loading…" : formatCurrency(deliveredAmountTotal)}
            detail="Delivered to customer"
            tone="success"
          />
          <MetricCard
            label="Page amount"
            value={loading ? "Loading…" : formatCurrency(pageAmount)}
            detail={`${formatCount(orders.length)} orders on this page`}
          />
          <MetricCard
            label="Page"
            value={loading ? "Loading…" : `${formatCount(page)} / ${formatCount(totalPages)}`}
            detail={`${formatCount(pageSize)} per page`}
          />
        </section>

        {syncMessage ? (
          <p className="order-mapping-inline-message" aria-live="polite">
            {syncMessage}
          </p>
        ) : null}

        {hasAppliedDateRange ? (
          <p className="order-mapping-inline-message">
            Showing orders from {appliedStartDate} to {appliedEndDate}.
          </p>
        ) : null}

        {syncError ? (
          <p className="order-mapping-inline-message order-mapping-inline-message--error" role="alert">
            {syncError}
          </p>
        ) : null}

        {loading ? (
          <section className="order-mapping-state" aria-busy="true" aria-live="polite">
            <div className="order-mapping-state-title">Loading Shopify orders…</div>
            <div className="order-mapping-state-subtitle">Fetching the current Shopify order list.</div>
            <div className="order-mapping-skeleton">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="order-mapping-skeleton-row" />
              ))}
            </div>
          </section>
        ) : error ? (
          <section className="order-mapping-state order-mapping-state--error" role="alert">
            <div className="order-mapping-state-title">Could not load Shopify orders</div>
            <div className="order-mapping-state-subtitle">{FALLBACK_ERROR}</div>
          </section>
        ) : emptyState ? (
          <section className="order-mapping-state" aria-live="polite">
            <div className="order-mapping-state-title">No Shopify orders found</div>
            <div className="order-mapping-state-subtitle">There are no orders to display yet.</div>
          </section>
        ) : (
          <>
            <OrderTable orders={orders} />
            <div className="order-mapping-footer">
              <div className="order-mapping-footer-actions">
                <label className="order-mapping-date-field">
                  <span>Show</span>
                  <select
                    value={pageSize}
                    onChange={(event) => {
                      setPageSize(Number(event.target.value));
                      setPage(1);
                    }}
                    disabled={loading || syncing}
                  >
                    {PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="order-mapping-page-button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={loading || syncing || page <= 1}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="order-mapping-page-button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={loading || syncing || page >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
            <div className="order-mapping-cards">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
