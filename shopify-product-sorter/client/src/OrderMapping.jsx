import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./orderMappingApi";
import { OrderCard, MetricCard, OrderTable } from "./OrderMappingComponents.jsx";
import {
  getOrderLabel,
  getStatusFilterLabel,
  readOrdersPayload,
} from "./orderMappingView";
import { formatCount, formatCurrency, formatDateTime, formatText } from "./utils/format.js";
import "./orderMapping.css";

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
const FALLBACK_ERROR = "We couldn't load Shopify orders right now. Please try again.";
const TODAY = new Date().toISOString().slice(0, 10);
const PASSBOOK_ACCEPT = ".csv,.xlsx,.xls,.pdf,text/csv,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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

function getPassbookIssueReason(row) {
  if (row.duplicate) {
    return "Duplicate transaction";
  }
  if (row.matchStatus === "CONFLICT") {
    return "Identifiers point to different orders";
  }
  if (row.matchStatus === "UNMATCHED") {
    return "No exact order match";
  }
  if (row.matchStatus === "SKIPPED") {
    return row.skippedType ? row.skippedType.replaceAll("_", " ") : "Skipped";
  }
  return row.matchMethod || "Matched";
}

function formatChargeType(value) {
  return String(value || "OTHER")
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function renderMoneyCell(value) {
  return value === null || value === undefined || value === "" ? "—" : formatCurrency(value);
}

function BreakdownRow({ label, value }) {
  return (
    <div className="order-mapping-breakdown-row">
      <span>{label}</span>
      <strong>{value ? formatCurrency(value) : "₹0.00"}</strong>
    </div>
  );
}

function PassbookRowsTable({ rows, emptyMessage }) {
  if (!rows.length) {
    return (
      <div className="order-mapping-state">
        <div className="order-mapping-state-subtitle">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="order-mapping-table-wrap">
      <table className="order-mapping-table">
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Type</th>
            <th scope="col">Description</th>
            <th scope="col">AWB</th>
            <th scope="col">Debit</th>
            <th scope="col">Credit</th>
            <th scope="col">Net</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.sourceRowNumber || row.id}-${row.transactionIdentity || row.transaction_id || row.description}`}>
              <td className="order-mapping-cell">{formatDateTime(row.transactionDate || row.transaction_date)}</td>
              <td className="order-mapping-cell">{formatChargeType(row.chargeType || row.charge_type)}</td>
              <td className="order-mapping-cell">{formatText(row.description)}</td>
              <td className="order-mapping-cell">{formatText(row.awb)}</td>
              <td className="order-mapping-cell">{renderMoneyCell(row.debitAmount ?? row.debit_amount)}</td>
              <td className="order-mapping-cell">{renderMoneyCell(row.creditAmount ?? row.credit_amount)}</td>
              <td className="order-mapping-cell">{renderMoneyCell(row.netAmount ?? row.net_amount)}</td>
              <td className="order-mapping-cell">{getPassbookIssueReason(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  const [passbookPreview, setPassbookPreview] = useState(null);
  const [passbookHistory, setPassbookHistory] = useState([]);
  const [passbookImporting, setPassbookImporting] = useState(false);
  const [passbookError, setPassbookError] = useState("");
  const [selectedImportDetail, setSelectedImportDetail] = useState(null);
  const [importDetailLoading, setImportDetailLoading] = useState(false);
  const [selectedOrderDetail, setSelectedOrderDetail] = useState(null);
  const [orderDetailLoading, setOrderDetailLoading] = useState(false);
  const syncInFlightRef = useRef(false);
  const passbookInputRef = useRef(null);

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

  async function loadPassbookHistory() {
    const payload = await api.expenseImports(10);
    setPassbookHistory(payload.imports || []);
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

  useEffect(() => {
    loadPassbookHistory().catch(() => {});
  }, []);

  const hasDraftDateRange = Boolean(dateStartInput || dateEndInput);
  const hasAppliedDateRange = Boolean(appliedStartDate && appliedEndDate);
  const hasPendingDateChange =
    dateStartInput !== appliedStartDate || dateEndInput !== appliedEndDate;

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

  const previewIssueRows = useMemo(() => {
    const rows = passbookPreview?.rows || [];
    return rows.filter((row) => row.matchStatus === "UNMATCHED" || row.matchStatus === "CONFLICT" || row.duplicate);
  }, [passbookPreview]);

  const importIssueRows = useMemo(() => {
    const rows = selectedImportDetail?.rows || [];
    return rows.filter((row) => row.match_status === "UNMATCHED" || row.match_status === "CONFLICT");
  }, [selectedImportDetail]);

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
          `SYNC COMPLETED WITH WARNINGS: ${syncResult.ordersFetched || 0} orders processed, ${syncResult.tracking?.updated || 0} updated, ${syncResult.tracking?.failed || 0} require attention.`,
        );
      } else if (syncResult) {
        setSyncMessage(
          `Sync completed successfully: ${syncResult.ordersFetched || 0} orders processed, ${syncResult.tracking?.updated || 0} updated, ${syncResult.tracking?.skippedTerminal || 0} skipped terminal.`,
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

  function openPassbookPicker() {
    passbookInputRef.current?.click();
  }

  async function handlePassbookSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setPassbookImporting(true);
    setPassbookError("");
    setSelectedImportDetail(null);
    try {
      const preview = await api.previewExpenseImport(file);
      setPassbookPreview(preview);
      setSyncMessage(`Passbook preview ready: ${preview.financialRows || 0} financial transactions parsed from ${preview.fileName}.`);
    } catch (err) {
      setPassbookPreview(null);
      setPassbookError(`${err.code || "PASSBOOK_IMPORT_FAILED"}: ${err.message || "Passbook import failed."}`);
    } finally {
      setPassbookImporting(false);
    }
  }

  async function handleConfirmPassbookImport() {
    if (!passbookPreview?.importId) {
      return;
    }
    setPassbookImporting(true);
    setPassbookError("");
    try {
      const result = await api.confirmExpenseImport(passbookPreview.importId);
      setPassbookPreview(null);
      setSyncMessage(
        `Passbook imported: ${result.insertedTransactions || 0} transactions saved, ${result.duplicateTransactions || 0} duplicates skipped.`,
      );
      await Promise.all([
        refreshOrders(),
        loadPassbookHistory(),
      ]);
      if (result.importId) {
        await handleOpenImport(result.importId);
      }
    } catch (err) {
      setPassbookError(`${err.code || "PASSBOOK_IMPORT_FAILED"}: ${err.message || "Could not confirm passbook import."}`);
    } finally {
      setPassbookImporting(false);
    }
  }

  async function handleOpenImport(importId) {
    setImportDetailLoading(true);
    setPassbookError("");
    try {
      const payload = await api.expenseImport(importId);
      setSelectedImportDetail(payload);
    } catch (err) {
      setPassbookError(`${err.code || "PASSBOOK_HISTORY_FAILED"}: ${err.message || "Could not load import details."}`);
    } finally {
      setImportDetailLoading(false);
    }
  }

  async function handleOpenOrder(orderId) {
    setOrderDetailLoading(true);
    try {
      const payload = await api.order(orderId);
      setSelectedOrderDetail(payload);
    } catch (err) {
      setSyncError(`${err.code || "ORDER_DETAIL_FAILED"}: ${err.message || "Could not load order details."}`);
    } finally {
      setOrderDetailLoading(false);
    }
  }

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
                disabled={loading || syncing || passbookImporting}
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
                disabled={syncing || passbookImporting}
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
                disabled={syncing || passbookImporting}
              />
            </label>
            <div className="order-mapping-range-actions">
              <button
                type="button"
                className="order-mapping-page-button order-mapping-page-button--secondary"
                onClick={applyDateRange}
                disabled={syncing || passbookImporting || !hasPendingDateChange}
              >
                Apply range
              </button>
              <button
                type="button"
                className="order-mapping-page-button order-mapping-page-button--ghost"
                onClick={clearDateRange}
                disabled={syncing || passbookImporting || !hasDraftDateRange}
              >
                Clear
              </button>
            </div>
            <button
              type="button"
              className="order-mapping-page-button order-mapping-page-button--secondary"
              onClick={openPassbookPicker}
              disabled={loading || syncing || passbookImporting}
            >
              {passbookImporting ? "Importing…" : "Import Shiprocket Passbook"}
            </button>
            <button
              type="button"
              className="order-mapping-sync-button"
              onClick={handleSync}
              disabled={loading || syncing || passbookImporting}
            >
              {syncing ? "Syncing…" : "Sync"}
            </button>
            <input
              ref={passbookInputRef}
              type="file"
              accept={PASSBOOK_ACCEPT}
              className="order-mapping-hidden-input"
              onChange={handlePassbookSelection}
            />
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

        {passbookError ? (
          <p className="order-mapping-inline-message order-mapping-inline-message--error" role="alert">
            {passbookError}
          </p>
        ) : null}

        {passbookPreview ? (
          <section className="order-mapping-panel">
            <div className="order-mapping-panel-header">
              <div>
                <p className="order-mapping-eyebrow">Shiprocket Passbook Preview</p>
                <h2>{passbookPreview.fileName}</h2>
                <p className="order-mapping-state-subtitle">
                  {passbookPreview.parsedRows} rows · {passbookPreview.financialRows} financial transactions · {passbookPreview.format}
                </p>
              </div>
              <div className="order-mapping-panel-actions">
                <button
                  type="button"
                  className="order-mapping-page-button"
                  onClick={() => setPassbookPreview(null)}
                  disabled={passbookImporting}
                >
                  Discard Preview
                </button>
                <button
                  type="button"
                  className="order-mapping-page-button order-mapping-page-button--secondary"
                  onClick={handleConfirmPassbookImport}
                  disabled={passbookImporting}
                >
                  {passbookImporting ? "Saving…" : "Confirm Import"}
                </button>
              </div>
            </div>
            <div className="order-mapping-preview-grid">
              <MetricCard label="Matched" value={formatCount(passbookPreview.matched)} detail="Attached to Shopify orders" />
              <MetricCard label="Unmatched" value={formatCount(passbookPreview.unmatched)} detail="Preserved without order link" />
              <MetricCard label="Conflicts" value={formatCount(passbookPreview.conflicts)} detail="Not auto-assigned" />
              <MetricCard label="Duplicates" value={formatCount(passbookPreview.duplicates)} detail="Already imported transactions" />
              <MetricCard label="Gross Debits" value={formatCurrency(passbookPreview.grossDebits)} detail="Charges" />
              <MetricCard label="Gross Credits" value={formatCurrency(passbookPreview.grossCredits)} detail="Credits / reversals" />
              <MetricCard label="Net Charges" value={formatCurrency(passbookPreview.netCharges)} detail="Debit minus credit" tone="primary" />
            </div>
            <PassbookRowsTable
              rows={previewIssueRows.length ? previewIssueRows : (passbookPreview.rows || []).slice(0, 15)}
              emptyMessage="No unmatched, conflicting, or duplicate passbook rows in this preview."
            />
          </section>
        ) : null}

        <section className="order-mapping-panel">
          <div className="order-mapping-panel-header">
            <div>
              <p className="order-mapping-eyebrow">Passbook Import History</p>
              <h2>Recent Shiprocket cost imports</h2>
            </div>
          </div>
          {!passbookHistory.length ? (
            <div className="order-mapping-state">
              <div className="order-mapping-state-subtitle">No Shiprocket passbooks imported yet.</div>
            </div>
          ) : (
            <div className="order-mapping-table-wrap">
              <table className="order-mapping-table">
                <thead>
                  <tr>
                    <th scope="col">File</th>
                    <th scope="col">Imported</th>
                    <th scope="col">Transactions</th>
                    <th scope="col">Matched</th>
                    <th scope="col">Unmatched</th>
                    <th scope="col">Conflicts</th>
                    <th scope="col">Net</th>
                    <th scope="col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {passbookHistory.map((item) => (
                    <tr key={item.id}>
                      <td className="order-mapping-cell">{formatText(item.source_file_name)}</td>
                      <td className="order-mapping-cell">{formatDateTime(item.uploaded_at)}</td>
                      <td className="order-mapping-cell">{formatCount(item.financial_row_count)}</td>
                      <td className="order-mapping-cell">{formatCount(item.matched_count)}</td>
                      <td className="order-mapping-cell">{formatCount(item.unmatched_count)}</td>
                      <td className="order-mapping-cell">{formatCount(item.conflict_count)}</td>
                      <td className="order-mapping-cell">{formatCurrency(item.net_amount)}</td>
                      <td className="order-mapping-cell">
                        <button type="button" className="order-mapping-page-button" onClick={() => handleOpenImport(item.id)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {selectedImportDetail ? (
          <section className="order-mapping-panel">
            <div className="order-mapping-panel-header">
              <div>
                <p className="order-mapping-eyebrow">Import Detail</p>
                <h2>{selectedImportDetail.import.source_file_name}</h2>
                <p className="order-mapping-state-subtitle">
                  {selectedImportDetail.import.financial_row_count} financial transactions · {formatCurrency(selectedImportDetail.import.net_amount)}
                </p>
              </div>
              {importDetailLoading ? <span className="order-mapping-state-subtitle">Loading…</span> : null}
            </div>
            <PassbookRowsTable
              rows={importIssueRows.length ? importIssueRows : selectedImportDetail.rows.slice(0, 15)}
              emptyMessage="This import has no unmatched or conflicting transactions."
            />
          </section>
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
            <OrderTable orders={orders} onOpenDetails={handleOpenOrder} />
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
                    disabled={loading || syncing || passbookImporting}
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
                  disabled={loading || syncing || passbookImporting || page <= 1}
                >
                  Previous
                </button>
                <button
                  type="button"
                  className="order-mapping-page-button"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={loading || syncing || passbookImporting || page >= totalPages}
                >
                  Next
                </button>
              </div>
            </div>
            <div className="order-mapping-cards">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} onOpenDetails={handleOpenOrder} />
              ))}
            </div>
          </>
        )}

        {selectedOrderDetail ? (
          <section className="order-mapping-panel">
            <div className="order-mapping-panel-header">
              <div>
                <p className="order-mapping-eyebrow">Order Cost Detail</p>
                <h2>{getOrderLabel(selectedOrderDetail.order)}</h2>
                <p className="order-mapping-state-subtitle">
                  {orderDetailLoading ? "Loading Shiprocket costs…" : `${selectedOrderDetail.expenseTransactions?.length || 0} matched transactions`}
                </p>
              </div>
              <button type="button" className="order-mapping-page-button" onClick={() => setSelectedOrderDetail(null)}>
                Close
              </button>
            </div>
            <div className="order-mapping-breakdown">
              <BreakdownRow label="Forward Freight" value={selectedOrderDetail.expenseBreakdown?.forward_freight} />
              <BreakdownRow label="RTO Freight" value={selectedOrderDetail.expenseBreakdown?.rto_freight} />
              <BreakdownRow label="COD Charge" value={selectedOrderDetail.expenseBreakdown?.cod_charge} />
              <BreakdownRow label="Weight Adjustment" value={selectedOrderDetail.expenseBreakdown?.weight_adjustment} />
              <BreakdownRow label="Surcharge" value={selectedOrderDetail.expenseBreakdown?.surcharge} />
              <BreakdownRow label="Other" value={selectedOrderDetail.expenseBreakdown?.other} />
              <BreakdownRow label="Credits" value={selectedOrderDetail.expenseBreakdown?.credits} />
              <BreakdownRow label="Net Shiprocket Cost" value={selectedOrderDetail.expenseBreakdown?.net_shiprocket_cost} />
            </div>
            <PassbookRowsTable
              rows={selectedOrderDetail.expenseTransactions || []}
              emptyMessage="No matched Shiprocket cost transactions for this order yet."
            />
          </section>
        ) : null}
      </section>
    </main>
  );
}
