import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./orderMappingApi";
import "./orderMapping.css";

const TODAY = "2026-07-23";
const DEFAULT_START = "2026-05-25";
const STATUS_OPTIONS = [
  "ALL",
  "PENDING_TRACKING",
  "MANIFESTED",
  "PICKUP_PENDING",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERY_ATTEMPTED",
  "UNDELIVERED",
  "DELIVERED_TO_CUSTOMER",
  "RTO_INITIATED",
  "RTO_IN_TRANSIT",
  "RTO_OUT_FOR_DELIVERY",
  "RTO_DELIVERED",
  "LOST",
  "DAMAGED",
  "CANCELLED",
  "SHIPMENT_EXCEPTION",
  "UNKNOWN",
];

const SOURCE_OPTIONS = [
  "ALL",
  "SHOPIFY",
  "SHIPROCKET_API",
  "CSV_IMPORT",
  "MANUAL",
  "DATABASE_CACHE",
  "LEGACY_DATA",
];

const ACTION_LABELS = {
  shopify_sync: "Shopify sync",
  shiprocket_refresh: "Shiprocket refresh",
  shiprocket_force_refresh: "Force refresh",
  csv_preview: "CSV preview",
  csv_import: "CSV import",
  manual_update: "Manual update",
  manual_clear: "Manual clear",
};

function label(value) {
  return String(value || "—")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value, withTime = false) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-IN",
    withTime
      ? { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }
      : { dateStyle: "medium", timeZone: "Asia/Kolkata" },
  ).format(new Date(value));
}

function formatCount(value) {
  return new Intl.NumberFormat("en-IN").format(Number(value || 0));
}

function StatusBadge({ value }) {
  return (
    <span className={`order-mapping-status status-${String(value).toLowerCase()}`}>
      {label(value)}
    </span>
  );
}

function MetricStrip({ total, summary, manualCount }) {
  const cards = [
    { title: "Total", value: total },
    { title: "Pending tracking", value: summary.PENDING_TRACKING || 0 },
    { title: "In transit", value: summary.IN_TRANSIT || 0 },
    { title: "Out for delivery", value: summary.OUT_FOR_DELIVERY || 0 },
    { title: "Delivered", value: summary.DELIVERED_TO_CUSTOMER || 0 },
    { title: "Exceptions", value: (summary.UNDELIVERED || 0) + (summary.SHIPMENT_EXCEPTION || 0) + (summary.LOST || 0) },
    { title: "Manual overrides", value: manualCount },
  ];

  return (
    <section className="order-mapping-metric-strip">
      {cards.map((card) => (
        <article key={card.title} className="order-mapping-metric-card">
          <span>{card.title}</span>
          <strong>{formatCount(card.value)}</strong>
        </article>
      ))}
    </section>
  );
}

function QueueStrip({ summary, manualCount }) {
  const queues = [
    {
      title: "Needs tracking",
      description: "Orders still showing Shopify-only status.",
      value: summary.PENDING_TRACKING || 0,
    },
    {
      title: "Courier issues",
      description: "Undelivered, exceptions, lost or damaged shipments.",
      value:
        (summary.UNDELIVERED || 0) +
        (summary.SHIPMENT_EXCEPTION || 0) +
        (summary.LOST || 0) +
        (summary.DAMAGED || 0),
    },
    {
      title: "Return flow",
      description: "RTO statuses requiring review.",
      value:
        (summary.RTO_INITIATED || 0) +
        (summary.RTO_IN_TRANSIT || 0) +
        (summary.RTO_OUT_FOR_DELIVERY || 0),
    },
    {
      title: "Manual",
      description: "Orders with an active manual decision.",
      value: manualCount,
    },
  ];

  return (
    <section className="order-mapping-queues">
      {queues.map((queue) => (
        <article key={queue.title} className="order-mapping-queue-card">
          <div>
            <h3>{queue.title}</h3>
            <p>{queue.description}</p>
          </div>
          <strong>{formatCount(queue.value)}</strong>
        </article>
      ))}
    </section>
  );
}

function RailLogList({ title, rows, loading, error, renderBody }) {
  return (
    <section className="order-mapping-rail-panel">
      <div className="order-mapping-rail-panel-header">
        <h3>{title}</h3>
        {loading ? <span>Refreshing…</span> : null}
      </div>
      {error ? <p className="order-mapping-error-text">{error}</p> : null}
      {!rows.length ? (
        <div className="order-mapping-empty">No recent activity.</div>
      ) : (
        <div className="order-mapping-log-list">
          {rows.map((row) => (
            <article key={row.id} className="order-mapping-log-item">
              {renderBody(row)}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ManualStatusModal({ details, onClose, onSave, onClear }) {
  const [shipmentId, setShipmentId] = useState(details.shipments[0]?.id || "");
  const [normalizedStatus, setNormalizedStatus] = useState(
    details.shipments[0]?.normalized_status || "PENDING_TRACKING",
  );
  const [rawStatus, setRawStatus] = useState(details.shipments[0]?.raw_status || "");
  const [effectiveAt, setEffectiveAt] = useState(TODAY);
  const [remarks, setRemarks] = useState("");
  const [locked, setLocked] = useState(true);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    try {
      await onSave({
        shipmentId,
        normalizedStatus,
        rawStatus,
        effectiveAt: `${effectiveAt}T00:00:00Z`,
        remarks,
        locked,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="order-mapping-modal-backdrop" role="presentation">
      <form
        className="order-mapping-modal"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <header>
          <div>
            <p>Manual update</p>
            <h2>{details.order.shopify_order_name}</h2>
          </div>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>

        <label>
          Shipment
          <select value={shipmentId} onChange={(event) => setShipmentId(event.target.value)}>
            {details.shipments.map((shipment) => (
              <option key={shipment.id} value={shipment.id}>
                {shipment.awb || shipment.shopify_tracking_number || "No AWB"} ·{" "}
                {label(shipment.normalized_status)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select
            value={normalizedStatus}
            onChange={(event) => setNormalizedStatus(event.target.value)}
          >
            {STATUS_OPTIONS.filter((status) => status !== "ALL").map((status) => (
              <option key={status} value={status}>
                {label(status)}
              </option>
            ))}
          </select>
        </label>

        <label>
          Raw status
          <input value={rawStatus} onChange={(event) => setRawStatus(event.target.value)} />
        </label>

        <label>
          Effective date
          <input
            type="date"
            value={effectiveAt}
            max={TODAY}
            onChange={(event) => setEffectiveAt(event.target.value)}
          />
        </label>

        <label>
          Remarks
          <textarea
            value={remarks}
            maxLength={1000}
            onChange={(event) => setRemarks(event.target.value)}
          />
        </label>

        <label className="order-mapping-checkbox">
          <input
            type="checkbox"
            checked={locked}
            onChange={(event) => setLocked(event.target.checked)}
          />
          Keep this manual override locked
        </label>

        <footer>
          <button type="button" onClick={() => onClear(shipmentId)}>
            Clear manual
          </button>
          <button className="primary" disabled={saving}>
            {saving ? "Saving…" : "Save update"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function OrderDetailsDrawer({ details, onClose, onManual, onRefresh }) {
  if (!details) {
    return null;
  }

  return (
    <aside className="order-mapping-drawer">
      <header>
        <div>
          <p>Order details</p>
          <h2>{details.order.shopify_order_name}</h2>
        </div>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      <section className="order-mapping-detail-grid">
        <div>
          <span>Shopify order</span>
          <strong>{details.order.shopify_order_id}</strong>
        </div>
        <div>
          <span>Order date</span>
          <strong>{formatDate(details.order.order_date, true)}</strong>
        </div>
        <div>
          <span>Customer</span>
          <strong>{details.order.customer_name || "—"}</strong>
        </div>
        <div>
          <span>Phone</span>
          <strong>{details.order.customer_phone || "—"}</strong>
        </div>
      </section>

      <section className="order-mapping-detail-section">
        <div className="order-mapping-section-heading">
          <h3>Shipments</h3>
          <button type="button" onClick={onManual}>
            Manual update
          </button>
        </div>
        <div className="order-mapping-detail-stack">
          {details.shipments.map((shipment) => (
            <article key={shipment.id} className="order-mapping-shipment-card">
              <div className="order-mapping-shipment-head">
                <div>
                  <strong>{shipment.awb || shipment.shopify_tracking_number || "No AWB"}</strong>
                  <span>{shipment.courier || "Unknown courier"}</span>
                </div>
                <button type="button" onClick={() => onRefresh(shipment.id)}>
                  Refresh
                </button>
              </div>
              <div className="order-mapping-shipment-meta">
                <StatusBadge value={shipment.normalized_status} />
                <span>{shipment.raw_status || "No raw status"}</span>
                <span>{label(shipment.status_source)}</span>
                <span>{formatDate(shipment.status_timestamp, true)}</span>
                <span>{formatDate(shipment.last_shiprocket_sync_at, true)}</span>
                {shipment.manual_override_lock ? <span>Manual lock</span> : null}
              </div>
              {shipment.sync_error ? (
                <p className="order-mapping-error-text">{shipment.sync_error}</p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="order-mapping-detail-section">
        <h3>Status history</h3>
        <div className="order-mapping-detail-stack">
          {details.history.length ? (
            details.history.map((entry) => (
              <article key={entry.id} className="order-mapping-history-row">
                <strong>
                  {label(entry.previous_status)} → {label(entry.next_status)}
                </strong>
                <span>{label(entry.source)}</span>
                <span>{formatDate(entry.recorded_at, true)}</span>
                {entry.remarks ? <span>{entry.remarks}</span> : null}
              </article>
            ))
          ) : (
            <div className="order-mapping-empty">No history recorded.</div>
          )}
        </div>
      </section>
    </aside>
  );
}

export default function OrderMapping({ sidebarBridge }) {
  const [filters, setFilters] = useState({
    page: 1,
    pageSize: 20,
    search: "",
    status: "ALL",
    source: "ALL",
    startDate: DEFAULT_START,
    endDate: TODAY,
    sortBy: "orderDate",
    sortDirection: "desc",
  });
  const [syncRange, setSyncRange] = useState({
    start: DEFAULT_START,
    end: TODAY,
  });
  const [data, setData] = useState({
    orders: [],
    summary: {},
    sourceSummary: {},
    total: 0,
    page: 1,
    pageSize: 20,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [initialLoading, setInitialLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState("");
  const [currentAction, setCurrentAction] = useState("");
  const [networkLogs, setNetworkLogs] = useState([]);
  const [actionLogs, setActionLogs] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [csvFile, setCsvFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const hasLoadedOrdersRef = useRef(false);

  const loadOrders = useCallback(
    async (nextFilters) => {
      if (hasLoadedOrdersRef.current) {
        setTableLoading(true);
      } else {
        setInitialLoading(true);
      }

      try {
        const payload = await api.orders(nextFilters);
        setData(payload);
        setError("");
        sidebarBridge?.updateDiagnostics?.({
          activeModule: "orderMapping",
          loadedOrders: payload.total,
        });
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        hasLoadedOrdersRef.current = true;
        setInitialLoading(false);
        setTableLoading(false);
      }
    },
    [sidebarBridge],
  );

  const loadLogs = useCallback(async (showSpinner = false) => {
    if (showSpinner) {
      setLogsLoading(true);
    }

    try {
      const [networkPayload, actionPayload] = await Promise.all([
        api.networkLogs(12),
        api.actionLogs(12),
      ]);
      setNetworkLogs(networkPayload.logs || []);
      setActionLogs(actionPayload.logs || []);
      setLogsError("");
    } catch (loadError) {
      setLogsError(loadError.message);
    } finally {
      if (showSpinner) {
        setLogsLoading(false);
      }
    }
  }, []);

  const refreshSelectedOrder = useCallback(async () => {
    if (!selectedOrderId) {
      return null;
    }

    const payload = await api.order(selectedOrderId);
    setSelectedDetails(payload);
    return payload;
  }, [selectedOrderId]);

  useEffect(() => {
    document.title = "Order Mapping";
  }, []);

  useEffect(() => {
    loadOrders(filters);
  }, [filters, loadOrders]);

  useEffect(() => {
    loadLogs(true);
    const timer = window.setInterval(() => {
      loadLogs(false).catch(() => {});
    }, 5000);
    return () => window.clearInterval(timer);
  }, [loadLogs]);

  useEffect(() => {
    if (!selectedOrderId) {
      setSelectedDetails(null);
      return;
    }

    refreshSelectedOrder().catch((detailsError) => {
      setError(detailsError.message);
    });
  }, [refreshSelectedOrder, selectedOrderId]);

  const manualCount = useMemo(
    () => data.sourceSummary?.MANUAL || 0,
    [data.sourceSummary],
  );

  async function runAction(name, work) {
    setCurrentAction(name);
    setMessage(`${name} started on Thursday, July 23, 2026.`);
    try {
      const result = await work();
      setMessage(
        typeof result === "string" ? result : `${name} completed on Thursday, July 23, 2026.`,
      );
      await Promise.all([loadOrders(filters), loadLogs(false)]);
      return result;
    } catch (actionError) {
      setError(actionError.message);
      await loadLogs(false);
      throw actionError;
    } finally {
      setCurrentAction("");
    }
  }

  async function openPreview() {
    if (!csvFile) {
      return;
    }

    const preview = await api.previewImport(csvFile);
    setCsvPreview(preview);
    setMessage(preview.duplicate ? "This CSV was already imported." : "CSV preview ready.");
  }

  const compactRows = useMemo(
    () =>
      data.orders.map((order) => ({
        ...order,
        flags: [
          order.manual_override_lock ? "Manual lock" : null,
          order.manual_override ? "Manual override" : null,
          order.terminal_status ? "Terminal" : null,
          order.sync_error ? "Sync error" : null,
        ].filter(Boolean),
      })),
    [data.orders],
  );

  return (
    <main className="order-mapping-page">
      <div className="order-mapping-shell">
        <aside className="order-mapping-rail">
          <section className="order-mapping-rail-panel order-mapping-rail-actions">
            <div className="order-mapping-rail-panel-header">
              <div>
                <p>Order Mapping</p>
                <h2>Activity rail</h2>
              </div>
            </div>

            <div className="order-mapping-action-stack">
              <button
                type="button"
                className="primary"
                disabled={Boolean(currentAction)}
                onClick={() =>
                  runAction("Shopify sync", async () => {
                    const result = await api.syncShopify(syncRange);
                    return `Shopify sync completed: ${result.processed} processed, ${result.shipmentsUpserted} shipments upserted.`;
                  })
                }
              >
                {currentAction === "Shopify sync" ? "Syncing Shopify…" : "Sync Shopify orders"}
              </button>

              <button
                type="button"
                disabled={Boolean(currentAction)}
                onClick={() =>
                  runAction("Shiprocket refresh", async () => {
                    const result = await api.refreshShiprocket(false);
                    return `Shiprocket refresh completed: ${result.updated} updated, ${result.skippedTerminal} terminal shipments skipped.`;
                  })
                }
              >
                {currentAction === "Shiprocket refresh"
                  ? "Refreshing tracking…"
                  : "Refresh tracking"}
              </button>

              <label className="order-mapping-upload">
                <span>{csvFile ? csvFile.name : "Choose CSV"}</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => setCsvFile(event.target.files?.[0] || null)}
                />
              </label>

              <button
                type="button"
                disabled={!csvFile || Boolean(currentAction)}
                onClick={() => runAction("CSV preview", () => openPreview())}
              >
                {currentAction === "CSV preview" ? "Preparing preview…" : "Preview CSV"}
              </button>
            </div>

            <div className="order-mapping-sync-window">
              <label>
                Sync from
                <input
                  type="date"
                  value={syncRange.start}
                  max={syncRange.end}
                  onChange={(event) =>
                    setSyncRange((current) => ({ ...current, start: event.target.value }))
                  }
                />
              </label>
              <label>
                Sync to
                <input
                  type="date"
                  value={syncRange.end}
                  min={syncRange.start}
                  max={TODAY}
                  onChange={(event) =>
                    setSyncRange((current) => ({ ...current, end: event.target.value }))
                  }
                />
              </label>
            </div>
          </section>

          <RailLogList
            title="Action log"
            rows={actionLogs}
            loading={logsLoading}
            error={logsError}
            renderBody={(row) => (
              <>
                <div className="order-mapping-log-head">
                  <strong>{ACTION_LABELS[row.sync_type] || label(row.sync_type)}</strong>
                  <StatusBadge value={row.status} />
                </div>
                <p>
                  {formatDate(row.started_at, true)}
                  {row.completed_at ? ` → ${formatDate(row.completed_at, true)}` : ""}
                </p>
                <div className="order-mapping-log-metrics">
                  <span>Processed {formatCount(row.processed_count)}</span>
                  <span>Updated {formatCount(row.updated_count)}</span>
                  <span>Failed {formatCount(row.failed_count)}</span>
                </div>
                {row.error_summary ? (
                  <p className="order-mapping-error-text">{row.error_summary}</p>
                ) : null}
              </>
            )}
          />

          <RailLogList
            title="Network log"
            rows={networkLogs}
            loading={logsLoading}
            error={logsError}
            renderBody={(row) => (
              <>
                <div className="order-mapping-log-head">
                  <strong>{label(row.operation)}</strong>
                  <StatusBadge value={row.status} />
                </div>
                <p>
                  {row.provider} · {row.method} · {row.status_code || "—"}
                </p>
                <p className="order-mapping-log-endpoint">{row.endpoint}</p>
                <div className="order-mapping-log-metrics">
                  <span>{row.duration_ms} ms</span>
                  <span>{formatDate(row.started_at, true)}</span>
                </div>
                {row.error_summary ? (
                  <p className="order-mapping-error-text">{row.error_summary}</p>
                ) : null}
              </>
            )}
          />
        </aside>

        <section className="order-mapping-workspace">
          <header className="order-mapping-header">
            <div>
              <p>Delivery operations</p>
              <h1>Order Mapping</h1>
              <span>
                Resolve delivery status issues from Shopify, Shiprocket, CSV history, and manual
                overrides.
              </span>
            </div>
            <div className="order-mapping-header-status">
              <span className="order-mapping-status-chip">
                Last filters: {formatDate(filters.startDate)} to {formatDate(filters.endDate)}
              </span>
              {message ? <span className="order-mapping-notice">{message}</span> : null}
            </div>
          </header>

          <MetricStrip total={data.total} summary={data.summary} manualCount={manualCount} />
          <QueueStrip summary={data.summary} manualCount={manualCount} />

          {csvPreview ? (
            <section className="order-mapping-preview">
              <div className="order-mapping-section-heading">
                <div>
                  <h2>CSV preview</h2>
                  <p>
                    {csvPreview.counts.totalRows} rows · {csvPreview.counts.matchedRows} matched ·{" "}
                    {csvPreview.counts.invalidRows} invalid · {csvPreview.counts.updatedRows} updates
                  </p>
                </div>
                <div className="order-mapping-inline-actions">
                  <button type="button" onClick={() => setCsvPreview(null)}>
                    Close preview
                  </button>
                  <button
                    type="button"
                    className="primary"
                    disabled={csvPreview.duplicate || Boolean(currentAction)}
                    onClick={() =>
                      runAction("CSV import", async () => {
                        const result = await api.commitImport(csvPreview.batchId);
                        setCsvPreview(null);
                        return result.duplicate
                          ? "CSV already imported."
                          : `CSV import completed: ${result.updatedRows} rows updated.`;
                      })
                    }
                  >
                    {currentAction === "CSV import" ? "Importing…" : "Commit import"}
                  </button>
                </div>
              </div>

              <div className="order-mapping-compact-table">
                <table>
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Order</th>
                      <th>AWB</th>
                      <th>Status</th>
                      <th>Validation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.sample.map((row) => (
                      <tr key={row.rowHash}>
                        <td>{row.rowNumber}</td>
                        <td>{row.orderNumber || row.shopifyOrderId || "—"}</td>
                        <td>{row.awb || "—"}</td>
                        <td>{label(row.normalizedStatus)}</td>
                        <td>
                          {row.validationErrors.length
                            ? row.validationErrors.join(", ")
                            : "Ready"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <section className="order-mapping-filters">
            <label className="order-mapping-search">
              Search
              <input
                value={filters.search}
                placeholder="Order, customer, phone, AWB"
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    search: event.target.value,
                    page: 1,
                  }))
                }
              />
            </label>

            <label>
              Status
              <select
                value={filters.status}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    status: event.target.value,
                    page: 1,
                  }))
                }
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status === "ALL" ? "All statuses" : label(status)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Source
              <select
                value={filters.source}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    source: event.target.value,
                    page: 1,
                  }))
                }
              >
                {SOURCE_OPTIONS.map((source) => (
                  <option key={source} value={source}>
                    {source === "ALL" ? "All sources" : label(source)}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Orders from
              <input
                type="date"
                value={filters.startDate}
                max={filters.endDate}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    startDate: event.target.value,
                    page: 1,
                  }))
                }
              />
            </label>

            <label>
              Orders to
              <input
                type="date"
                value={filters.endDate}
                min={filters.startDate}
                max={TODAY}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    endDate: event.target.value,
                    page: 1,
                  }))
                }
              />
            </label>
          </section>

          <section className="order-mapping-table-card">
            <div className="order-mapping-section-heading">
              <div>
                <h2>Orders queue</h2>
                <p>
                  {formatCount(data.total)} total orders · page {data.page}
                </p>
              </div>
              {tableLoading ? <span className="order-mapping-subtle">Refreshing…</span> : null}
            </div>

            {initialLoading ? (
              <div className="order-mapping-skeleton-list">
                {Array.from({ length: 8 }).map((_, index) => (
                  <div key={index} className="order-mapping-skeleton-row" />
                ))}
              </div>
            ) : !compactRows.length ? (
              <div className="order-mapping-empty">No orders found for the current filters.</div>
            ) : (
              <div className="order-mapping-table-wrap">
                <table className="order-mapping-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Shipment</th>
                      <th>Status</th>
                      <th>Updated</th>
                      <th>Source</th>
                      <th>Flags</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compactRows.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <div className="order-mapping-primary-cell">
                            <strong>{order.shopify_order_name}</strong>
                            <span>{formatDate(order.order_date)}</span>
                          </div>
                        </td>
                        <td>
                          <div className="order-mapping-primary-cell">
                            <strong>{order.customer_name || "—"}</strong>
                            <span>{order.customer_phone || "No phone"}</span>
                          </div>
                        </td>
                        <td>
                          <div className="order-mapping-primary-cell">
                            <strong>{order.awb || "No AWB"}</strong>
                            <span>{order.courier || "Unknown courier"}</span>
                          </div>
                        </td>
                        <td>
                          <div className="order-mapping-primary-cell">
                            <StatusBadge value={order.normalized_status} />
                            <span>{order.raw_status || "No raw status"}</span>
                          </div>
                        </td>
                        <td>
                          <div className="order-mapping-primary-cell">
                            <strong>{formatDate(order.status_timestamp, true)}</strong>
                            <span>{formatDate(order.last_shiprocket_sync_at, true)}</span>
                          </div>
                        </td>
                        <td>{label(order.display_source)}</td>
                        <td>
                          {order.flags.length ? (
                            <div className="order-mapping-flag-stack">
                              {order.flags.map((flag) => (
                                <span key={flag} className="order-mapping-flag">
                                  {flag}
                                </span>
                              ))}
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <div className="order-mapping-row-actions">
                            <button type="button" onClick={() => setSelectedOrderId(order.id)}>
                              Details
                            </button>
                            {order.primary_shipment_id ? (
                              <button
                                type="button"
                                disabled={Boolean(currentAction)}
                                onClick={() =>
                                  runAction("Shipment refresh", async () => {
                                    await api.refreshShipment(order.primary_shipment_id, true);
                                    return `Shipment ${order.shopify_order_name} force-refreshed.`;
                                  })
                                }
                              >
                                Refresh
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <footer className="order-mapping-footer">
            <button
              type="button"
              disabled={filters.page <= 1}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
            >
              Previous
            </button>
            <span>
              Page {data.page} of {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <button
              type="button"
              disabled={data.page * data.pageSize >= data.total}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
            >
              Next
            </button>
          </footer>
        </section>
      </div>

      <OrderDetailsDrawer
        details={selectedDetails}
        onClose={() => setSelectedOrderId(null)}
        onManual={() => setShowManualModal(true)}
        onRefresh={(shipmentId) =>
          runAction("Shipment refresh", async () => {
            await api.refreshShipment(shipmentId, true);
            await Promise.all([refreshSelectedOrder(), loadOrders(filters)]);
            return "Shipment force-refreshed.";
          })
        }
      />

      {showManualModal && selectedDetails ? (
        <ManualStatusModal
          details={selectedDetails}
          onClose={() => setShowManualModal(false)}
          onSave={async (payload) => {
            await api.manual(payload.shipmentId, payload);
            setShowManualModal(false);
            await Promise.all([refreshSelectedOrder(), loadOrders(filters), loadLogs(false)]);
            setMessage("Manual status saved.");
          }}
          onClear={async (shipmentId) => {
            await api.clearManual(shipmentId);
            setShowManualModal(false);
            await Promise.all([refreshSelectedOrder(), loadOrders(filters), loadLogs(false)]);
            setMessage("Manual override cleared.");
          }}
        />
      ) : null}
    </main>
  );
}
