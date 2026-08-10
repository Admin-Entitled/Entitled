import React, { useEffect, useMemo, useRef, useState } from "react";

import ExpenseMonthSelector from "./ExpenseMonthSelector.jsx";
import { expensesApi } from "./expensesApi.js";
import { MetaEmptyState, MetaMoneyKpiCard } from "./MetaAdsComponents.jsx";
import {
  buildCurrentMonthWarningMessages,
  buildExpenseMonthOptions,
  formatExpenseMonthLabel,
  getApiActivityDisplay,
  getBillsEmptyStateCopy,
  getExpenseStatusLabel,
  getExpenseStatusTone,
  getHistoryEmptyStateCopy,
  getReconciliationDisplay,
  getCurrentMonthValue,
} from "./expensesView.js";
import { formatMoneyForCurrency } from "./utils/format.js";

const PROVIDERS = [
  { key: "META", label: "Meta Ads" },
  { key: "SHIPROCKET", label: "Shiprocket" },
  { key: "SHOPIFY", label: "Shopify" },
];

function isAbortError(error) {
  return error?.name === "AbortError";
}

export default function Expenses() {
  const [dataMonths, setDataMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => getCurrentMonthValue());
  const [summary, setSummary] = useState(null);
  const [bills, setBills] = useState([]);
  const [history, setHistory] = useState([]);

  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMonth, setLoadingMonth] = useState("");
  const [error, setError] = useState("");

  const [showAddBill, setShowAddBill] = useState(false);
  const [formProvider, setFormProvider] = useState("META");
  const [formInvoiceNumber, setFormInvoiceNumber] = useState("");
  const [formInvoiceDate, setFormInvoiceDate] = useState("");
  const [formBillingMonth, setFormBillingMonth] = useState(() => getCurrentMonthValue());
  const [formSubtotal, setFormSubtotal] = useState("");
  const [formTax, setFormTax] = useState("");
  const [formTotal, setFormTotal] = useState("");
  const [formCurrency, setFormCurrency] = useState("INR");
  const [formFile, setFormFile] = useState(null);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");

  const [sortKey, setSortKey] = useState("invoiceDate");
  const [sortDirection, setSortDirection] = useState("desc");

  const requestRef = useRef({ id: 0, controller: null });

  useEffect(() => {
    void Promise.all([loadMonths(), loadHistory()]);
    return () => {
      requestRef.current.controller?.abort();
    };
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      void loadMonthData(selectedMonth);
    }
  }, [selectedMonth]);

  const navigationMonths = useMemo(
    () => buildExpenseMonthOptions({
      currentMonth: getCurrentMonthValue(),
      dataMonths,
      historyMonths: history.map((entry) => entry.month),
    }),
    [dataMonths, history],
  );

  const loadMonths = async () => {
    try {
      const res = await expensesApi.getMonths();
      if (res.success) {
        setDataMonths(res.months || []);
      }
    } catch (err) {
      setError("Failed to load month list: " + err.message);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await expensesApi.getHistory();
      if (res.success) {
        setHistory(res.history || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadMonthData = async (month) => {
    const nextId = requestRef.current.id + 1;
    requestRef.current.id = nextId;
    requestRef.current.controller?.abort();
    const controller = new AbortController();
    requestRef.current.controller = controller;

    setLoading(true);
    setLoadingMonth(month);
    setError("");

    try {
      const [sumRes, billsRes] = await Promise.all([
        expensesApi.getSummary(month, false, { signal: controller.signal }),
        expensesApi.getBills(month, { signal: controller.signal }),
      ]);

      if (requestRef.current.id !== nextId) {
        return;
      }

      setSummary(sumRes);
      setBills(billsRes.bills || []);
    } catch (err) {
      if (isAbortError(err) || requestRef.current.id !== nextId) {
        return;
      }
      setError(err.message || "Failed to load month expenses data");
    } finally {
      if (requestRef.current.id === nextId) {
        setLoading(false);
        setLoadingMonth("");
        requestRef.current.controller = null;
      }
    }
  };

  const handleSync = async () => {
    if (syncing || !selectedMonth) return;
    setSyncing(true);
    setSyncMessage(`Syncing ${formatExpenseMonthLabel(selectedMonth)}…`);
    setError("");
    try {
      const res = await expensesApi.syncExpenses(selectedMonth, true);
      if (res.success) {
        setSyncMessage(`Synced ${formatExpenseMonthLabel(selectedMonth)}.`);
      } else {
        const errs = res.errors?.join(", ") || "";
        setSyncMessage(`Expenses synced with ${res.errors?.length} provider error(s).`);
        setError(`Provider errors: ${errs}`);
      }
      await Promise.all([loadMonthData(selectedMonth), loadHistory(), loadMonths()]);
    } catch (err) {
      setSyncMessage("Sync failed.");
      setError(err.message || "Failed to sync expenses");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(""), 5000);
    }
  };

  const openAddBillModal = () => {
    setFormBillingMonth(selectedMonth);
    setFormError("");
    setFormSuccess("");
    setShowAddBill(true);
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFormFile(e.target.files[0]);
    }
  };

  const handleAddBillSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setFormSuccess("");

    if (!formProvider || !formInvoiceNumber || !formInvoiceDate || !formBillingMonth || !formTotal || !formCurrency) {
      setFormError("Missing required bill metadata fields");
      return;
    }

    const formData = new FormData();
    formData.append("provider", formProvider);
    formData.append("invoiceNumber", formInvoiceNumber);
    formData.append("invoiceDate", formInvoiceDate);
    formData.append("billingMonth", formBillingMonth);
    formData.append("subtotal", formSubtotal || formTotal);
    formData.append("tax", formTax || "0");
    formData.append("total", formTotal);
    formData.append("currency", formCurrency);
    if (formFile) {
      formData.append("file", formFile);
    }

    try {
      const res = await expensesApi.addBill(formData);
      if (res.success) {
        setFormSuccess("Bill successfully created/updated!");
        setFormInvoiceNumber("");
        setFormInvoiceDate("");
        setFormSubtotal("");
        setFormTax("");
        setFormTotal("");
        setFormFile(null);
        await Promise.all([loadMonthData(selectedMonth), loadHistory(), loadMonths()]);
        setTimeout(() => {
          setShowAddBill(false);
          setFormSuccess("");
        }, 1500);
      }
    } catch (err) {
      setFormError(err.message || "Failed to create bill");
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const sortedBills = useMemo(() => [...bills].sort((a, b) => {
    let valA = a[sortKey];
    let valB = b[sortKey];

    if (sortKey === "amount" || sortKey === "total") {
      valA = a.total;
      valB = b.total;
    }

    if (valA === undefined || valA === null) return 1;
    if (valB === undefined || valB === null) return -1;

    const dir = sortDirection === "asc" ? 1 : -1;
    if (typeof valA === "string") {
      return valA.localeCompare(valB) * dir;
    }
    return (valA - valB) * dir;
  }), [bills, sortDirection, sortKey]);

  const currency = summary?.currency || "INR";
  const totalsByProvider = summary?.providerTotals || [];
  const warningMessages = buildCurrentMonthWarningMessages({
    selectedMonth,
    providerTotals: totalsByProvider,
    currency,
  });
  const billsEmptyState = getBillsEmptyStateCopy(selectedMonth);
  const historyEmptyState = getHistoryEmptyStateCopy();

  const getProviderSummary = (providerKey) => totalsByProvider.find((provider) => provider.provider === providerKey) || {
    provider: providerKey,
    total: 0,
    billCount: 0,
    completeness: "UNKNOWN",
    apiExpense: 0,
    difference: 0,
    apiAvailable: false,
  };

  const handleHistorySelect = (month) => {
    if (month !== selectedMonth) {
      setSelectedMonth(month);
    }
  };

  const handleDownload = (provider = null, billCount = bills.length) => {
    if (billCount === 0 || !selectedMonth) {
      return;
    }
    window.location.assign(expensesApi.getBulkDownloadUrl(selectedMonth, provider));
  };

  return (
    <div className="dashboard-feature meta-dashboard expenses-dashboard">
      <div className="feature-header expenses-header">
        <div>
          <h2 className="feature-title">Expenses</h2>
          <p className="feature-subtitle">
            How much has been billed, what provider activity exists, and which bills are still missing.
          </p>
        </div>
        <div className="meta-header-actions expenses-header-actions">
          <ExpenseMonthSelector
            months={navigationMonths}
            selectedMonth={selectedMonth}
            onChange={setSelectedMonth}
          />
          <button
            type="button"
            className="button compact"
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync Expenses"}
          </button>
          <button
            type="button"
            className="button compact secondary"
            onClick={openAddBillModal}
          >
            Add Bill
          </button>
          <button
            type="button"
            className="button compact expenses-download-all"
            onClick={() => handleDownload(null, bills.length)}
            disabled={bills.length === 0 || !selectedMonth}
            title={bills.length === 0 ? "No bills available for this month." : `Download all bills for ${formatExpenseMonthLabel(selectedMonth)}`}
          >
            Download All Bills
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="info-banner expenses-info-banner">
          {syncMessage}
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ marginBottom: "15px" }}>
          <strong>Expenses Error</strong> · {error}
        </div>
      )}

      {(warningMessages.length > 0 || loading) && (
        <div className="info-banner expenses-warning-banner">
          {loading && (
            <div className="expenses-loading-copy">Loading {formatExpenseMonthLabel(loadingMonth || selectedMonth)}…</div>
          )}
          {warningMessages.map((message) => (
            <div key={message}>{message}</div>
          ))}
        </div>
      )}

      <div className={`meta-kpi-grid expenses-kpi-grid${loading ? " is-loading" : ""}`}>
        <MetaMoneyKpiCard label="MONTHLY EXPENSE" value={summary?.totalExpense} currency={currency} detail="Recognized billed invoices" />
        {PROVIDERS.map((provider) => {
          const providerSummary = getProviderSummary(provider.key);
          return (
            <MetaMoneyKpiCard
              key={provider.key}
              label={`${provider.label.toUpperCase()} INVOICED`}
              value={providerSummary.total}
              currency={currency}
              detail={`${providerSummary.billCount} bills · ${getExpenseStatusLabel(providerSummary.completeness)}`}
            />
          );
        })}
      </div>

      <div className={`expenses-provider-grid${loading ? " is-loading" : ""}`}>
        {PROVIDERS.map((provider) => {
          const providerSummary = getProviderSummary(provider.key);
          const billed = providerSummary.total || 0;
          const apiExpense = providerSummary.apiExpense || 0;
          const billCount = providerSummary.billCount || 0;
          const apiDisplay = getApiActivityDisplay({
            apiAvailable: providerSummary.apiAvailable,
            apiExpense,
            currency,
          });
          const reconciliationDisplay = getReconciliationDisplay({
            billed,
            apiExpense,
            apiAvailable: providerSummary.apiAvailable,
            currency,
          });

          return (
            <div key={provider.key} className="meta-chart-panel expenses-provider-card">
              <div className="expenses-provider-card-header">
                <h3>{provider.label}</h3>
                <span className={`status-chip expenses-status-chip tone-${getExpenseStatusTone(providerSummary.completeness)}`}>
                  {getExpenseStatusLabel(providerSummary.completeness)}
                </span>
              </div>

              <div className="expenses-provider-metrics">
                <div className="expenses-provider-row">
                  <span>Billed Expense</span>
                  <strong>{formatMoneyForCurrency(billed, currency)}</strong>
                </div>
                <div className="expenses-provider-row">
                  <span>{apiDisplay.label}</span>
                  <span className={apiDisplay.isUnavailable ? "expenses-muted-value" : ""}>{apiDisplay.value}</span>
                </div>
                {reconciliationDisplay && (
                  <div className="expenses-provider-row">
                    <span>{reconciliationDisplay.label}</span>
                    <span className={reconciliationDisplay.tone === "warning" ? "expenses-warning-value" : ""}>
                      {reconciliationDisplay.value}
                    </span>
                  </div>
                )}
                <div className="expenses-provider-row expenses-provider-row--divider">
                  <span>Bills</span>
                  <span>{billCount}</span>
                </div>
              </div>

              <button
                type="button"
                className="button compact secondary expenses-provider-download"
                onClick={() => handleDownload(provider.key, billCount)}
                disabled={billCount === 0 || !selectedMonth}
                title={billCount === 0 ? "No bills available for this provider this month." : `Download ${provider.label} bills for ${formatExpenseMonthLabel(selectedMonth)}`}
              >
                Download Bills (ZIP)
              </button>
            </div>
          );
        })}
      </div>

      <div className="meta-table-panel expenses-bills-panel">
        <div className="meta-table-title expenses-section-title">
          <span>Bills & Invoices ({sortedBills.length})</span>
        </div>
        <div className="table-container" style={{ overflowX: "auto" }}>
          {sortedBills.length === 0 ? (
            <div className="expenses-empty-state">
              <MetaEmptyState message={`${billsEmptyState.title} ${billsEmptyState.body}`} />
              <div className="expenses-empty-state-actions">
                <button type="button" className="button compact secondary" onClick={openAddBillModal}>Add Bill</button>
                <button type="button" className="button compact" onClick={handleSync} disabled={syncing}>
                  {syncing ? "Syncing…" : "Sync Expenses"}
                </button>
              </div>
            </div>
          ) : (
            <table className="data-table meta-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" onClick={() => handleSort("invoiceDate")} className="meta-sort-button">
                      Date {sortKey === "invoiceDate" ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => handleSort("provider")} className="meta-sort-button">
                      Provider {sortKey === "provider" ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th>Invoice / Bill</th>
                  <th>
                    <button type="button" onClick={() => handleSort("total")} className="meta-sort-button">
                      Amount {sortKey === "total" ? (sortDirection === "asc" ? " ▲" : " ▼") : ""}
                    </button>
                  </th>
                  <th>Download</th>
                </tr>
              </thead>
              <tbody>
                {sortedBills.map((bill) => (
                  <tr key={bill.id} className="meta-row">
                    <td>{new Date(bill.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                    <td>{bill.provider === "META" ? "Meta Ads" : bill.provider === "SHIPROCKET" ? "Shiprocket" : "Shopify"}</td>
                    <td>{bill.invoiceNumber}</td>
                    <td>{formatMoneyForCurrency(bill.total, bill.currency)}</td>
                    <td>
                      {bill.status === "AVAILABLE" ? (
                        <a
                          href={expensesApi.getBillDownloadUrl(bill.id)}
                          className="button compact secondary"
                          download
                          style={{ textDecoration: "none" }}
                        >
                          Download
                        </a>
                      ) : (
                        <span className="expenses-muted-value">Document unavailable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="meta-table-panel expenses-history-panel">
        <div className="meta-table-title expenses-section-title">Monthly Expense History</div>
        <div className="table-container">
          {history.length === 0 ? (
            <div className="expenses-history-empty">
              <div className="expenses-history-empty-title">{historyEmptyState.title}</div>
              <div className="expenses-history-empty-copy">{historyEmptyState.body}</div>
            </div>
          ) : (
            <table className="data-table meta-table expenses-history-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Total Billed Expense</th>
                </tr>
              </thead>
              <tbody>
                {history.map((entry) => (
                  <tr key={entry.month}>
                    <td>
                      <button
                        type="button"
                        className="expenses-history-link"
                        onClick={() => handleHistorySelect(entry.month)}
                      >
                        {formatExpenseMonthLabel(entry.month)}
                      </button>
                    </td>
                    <td style={{ fontWeight: "600" }}>{formatMoneyForCurrency(entry.totalExpense, entry.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAddBill && (
        <div className="modal-overlay expenses-modal-overlay">
          <div className="modal-content expenses-modal">
            <h3 className="expenses-modal-title">Add Merchant Bill</h3>

            {formError && <div className="error-banner" style={{ marginBottom: "15px" }}>{formError}</div>}
            {formSuccess && <div className="info-banner expenses-success-banner">{formSuccess}</div>}

            <form onSubmit={handleAddBillSubmit} className="expenses-form-grid">
              <label className="expenses-field" htmlFor="expenses-provider">
                <span>Provider *</span>
                <select id="expenses-provider" name="provider" value={formProvider} onChange={(e) => setFormProvider(e.target.value)}>
                  <option value="META">Meta Ads</option>
                  <option value="SHIPROCKET">Shiprocket</option>
                  <option value="SHOPIFY">Shopify</option>
                </select>
              </label>

              <div className="expenses-two-column-grid">
                <label className="expenses-field" htmlFor="expenses-invoice-number">
                  <span>Invoice Number *</span>
                  <input id="expenses-invoice-number" name="invoiceNumber" type="text" required value={formInvoiceNumber} onChange={(e) => setFormInvoiceNumber(e.target.value)} placeholder="META-1234" />
                </label>
                <label className="expenses-field" htmlFor="expenses-invoice-date">
                  <span>Invoice Date *</span>
                  <input id="expenses-invoice-date" name="invoiceDate" type="date" required value={formInvoiceDate} onChange={(e) => setFormInvoiceDate(e.target.value)} />
                </label>
              </div>

              <div className="expenses-two-column-grid">
                <label className="expenses-field" htmlFor="expenses-billing-month">
                  <span>Billing Month *</span>
                  <input id="expenses-billing-month" name="billingMonth" type="text" required value={formBillingMonth} onChange={(e) => setFormBillingMonth(e.target.value)} placeholder="YYYY-MM" />
                </label>
                <label className="expenses-field" htmlFor="expenses-currency">
                  <span>Currency *</span>
                  <input id="expenses-currency" name="currency" type="text" required value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)} placeholder="INR" />
                </label>
              </div>

              <div className="expenses-three-column-grid">
                <label className="expenses-field" htmlFor="expenses-subtotal">
                  <span>Subtotal</span>
                  <input id="expenses-subtotal" name="subtotal" type="number" step="0.01" value={formSubtotal} onChange={(e) => setFormSubtotal(e.target.value)} placeholder="0.00" />
                </label>
                <label className="expenses-field" htmlFor="expenses-tax">
                  <span>Tax Amount</span>
                  <input id="expenses-tax" name="tax" type="number" step="0.01" value={formTax} onChange={(e) => setFormTax(e.target.value)} placeholder="0.00" />
                </label>
                <label className="expenses-field" htmlFor="expenses-total">
                  <span>Total Amount *</span>
                  <input id="expenses-total" name="total" type="number" step="0.01" required value={formTotal} onChange={(e) => setFormTotal(e.target.value)} placeholder="0.00" />
                </label>
              </div>

              <label className="expenses-field" htmlFor="expenses-document">
                <span>Upload Document (PDF, PNG, JPG)</span>
                <input id="expenses-document" name="document" type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileChange} />
              </label>

              <div className="expenses-modal-actions">
                <button type="button" className="button compact secondary" onClick={() => setShowAddBill(false)}>Cancel</button>
                <button type="submit" className="button compact">Add Invoice</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
