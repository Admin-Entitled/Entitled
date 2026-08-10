import React, { useState, useEffect, useRef } from "react";
import { expensesApi } from "./expensesApi.js";
import { formatMoneyForCurrency } from "./utils/format.js";
import { MetaMoneyKpiCard, MetaKpiCard, MetaEmptyState } from "./MetaAdsComponents.jsx";

const PROVIDERS = [
  { key: "META", label: "Meta Ads" },
  { key: "SHIPROCKET", label: "Shiprocket" },
  { key: "SHOPIFY", label: "Shopify" },
];

export default function Expenses() {
  const [months, setMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [summary, setSummary] = useState(null);
  const [bills, setBills] = useState([]);
  const [history, setHistory] = useState([]);
  
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Modal / Form state for Add Bill
  const [showAddBill, setShowAddBill] = useState(false);
  const [formProvider, setFormProvider] = useState("META");
  const [formInvoiceNumber, setFormInvoiceNumber] = useState("");
  const [formInvoiceDate, setFormInvoiceDate] = useState("");
  const [formBillingMonth, setFormBillingMonth] = useState("");
  const [formSubtotal, setFormSubtotal] = useState("");
  const [formTax, setFormTax] = useState("");
  const [formTotal, setFormTotal] = useState("");
  const [formCurrency, setFormCurrency] = useState("INR");
  const [formFile, setFormFile] = useState(null);
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState("");
  
  // Sort State
  const [sortKey, setSortKey] = useState("invoiceDate");
  const [sortDirection, setSortDirection] = useState("desc");

  // Load Initial Month list and History
  useEffect(() => {
    loadMonths();
    loadHistory();
  }, []);

  useEffect(() => {
    if (selectedMonth) {
      loadMonthData(selectedMonth);
    }
  }, [selectedMonth]);

  const loadMonths = async () => {
    try {
      const res = await expensesApi.getMonths();
      if (res.success && res.months?.length) {
        setMonths(res.months);
        // Default to current month or latest available
        const currentMonthStr = new Date().toISOString().slice(0, 7);
        if (res.months.includes(currentMonthStr)) {
          setSelectedMonth(currentMonthStr);
        } else {
          setSelectedMonth(res.months[0]);
        }
      } else {
        const currentMonthStr = new Date().toISOString().slice(0, 7);
        setMonths([currentMonthStr]);
        setSelectedMonth(currentMonthStr);
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
    setLoading(true);
    setError("");
    try {
      const [sumRes, billsRes] = await Promise.all([
        expensesApi.getSummary(month),
        expensesApi.getBills(month),
      ]);
      setSummary(sumRes);
      setBills(billsRes.bills || []);
    } catch (err) {
      setError(err.message || "Failed to load month expenses data");
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    if (syncing || !selectedMonth) return;
    setSyncing(true);
    setSyncMessage("SYNCING...");
    setError("");
    try {
      const res = await expensesApi.syncExpenses(selectedMonth, true);
      if (res.success) {
        setSyncMessage("Sync successful!");
      } else {
        const errs = res.errors?.join(", ") || "";
        setSyncMessage(`Expenses synced with ${res.errors?.length} provider error(s).`);
        setError(`Provider errors: ${errs}`);
      }
      await loadMonthData(selectedMonth);
      await loadHistory();
      await loadMonths();
    } catch (err) {
      setSyncMessage("Sync failed.");
      setError(err.message || "Failed to sync expenses");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(""), 5000);
    }
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
        // Reset form
        setFormInvoiceNumber("");
        setFormInvoiceDate("");
        setFormSubtotal("");
        setFormTax("");
        setFormTotal("");
        setFormFile(null);
        // Refresh data
        await loadMonthData(selectedMonth);
        await loadHistory();
        await loadMonths();
        setTimeout(() => {
          setShowAddBill(false);
          setFormSuccess("");
        }, 1500);
      }
    } catch (err) {
      setFormError(err.message || "Failed to create bill");
    }
  };

  // Sort logic
  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const sortedBills = [...bills].sort((a, b) => {
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
  });

  const currency = summary?.currency || "INR";
  const totalsByProvider = summary?.providerTotals || [];

  const getProviderTotal = (pKey) => {
    return totalsByProvider.find((p) => p.provider === pKey)?.total || 0;
  };

  const getProviderBillCount = (pKey) => {
    return totalsByProvider.find((p) => p.provider === pKey)?.billCount || 0;
  };

  const getProviderCompleteness = (pKey) => {
    return totalsByProvider.find((p) => p.provider === pKey)?.completeness || "UNKNOWN";
  };

  const getProviderApiExpense = (pKey) => {
    return totalsByProvider.find((p) => p.provider === pKey)?.apiExpense || 0;
  };

  const getProviderDifference = (pKey) => {
    return totalsByProvider.find((p) => p.provider === pKey)?.difference || 0;
  };

  const formatMonthName = (mStr) => {
    if (!mStr) return "";
    const [y, m] = mStr.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  };

  const isCurrentMonth = selectedMonth === new Date().toISOString().slice(0, 7);

  // Incomplete warnings
  const showShopifyWarning = getProviderCompleteness("SHOPIFY") === "INCOMPLETE";
  const showMetaWarning = getProviderCompleteness("META") === "INCOMPLETE";
  const showShiprocketWarning = getProviderCompleteness("SHIPROCKET") === "INCOMPLETE";

  return (
    <div className="dashboard-feature">
      <div className="feature-header">
        <div>
          <h2 className="feature-title">Expenses</h2>
          <p className="feature-subtitle">
            Consolidated merchant monthly business expenses and billed records
          </p>
        </div>
        <div className="meta-header-actions" style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="compact"
            style={{ padding: "0.5rem", borderRadius: "4px", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)" }}
          >
            {months.map((m) => (
              <option key={m} value={m}>{formatMonthName(m)}</option>
            ))}
          </select>
          
          <button 
            type="button" 
            className="button compact" 
            onClick={handleSync}
            disabled={syncing}
          >
            {syncing ? "SYNCING..." : "Sync Expenses"}
          </button>

          <button
            type="button"
            className="button compact secondary"
            onClick={() => {
              setFormBillingMonth(selectedMonth);
              setShowAddBill(true);
            }}
          >
            Add Bill
          </button>
        </div>
      </div>

      {syncMessage && (
        <div className="info-banner" style={{ background: "rgba(0, 102, 204, 0.1)", border: "1px solid rgba(0, 102, 204, 0.2)", padding: "10px", borderRadius: "4px", marginBottom: "15px" }}>
          {syncMessage}
        </div>
      )}

      {error && (
        <div className="error-banner" style={{ marginBottom: "15px" }}>
          <strong>EXPENSES ERROR</strong> · {error}
        </div>
      )}

      {/* Warnings */}
      {(showShopifyWarning || showMetaWarning || showShiprocketWarning || isCurrentMonth) && (
        <div className="info-banner" style={{ background: "rgba(200, 150, 0, 0.1)", border: "1px solid rgba(200, 150, 0, 0.2)", color: "#b38600", padding: "10px", borderRadius: "4px", marginBottom: "15px", fontSize: "12px" }}>
          {isCurrentMonth && <div><strong>{formatMonthName(selectedMonth).toUpperCase()}</strong> is the current month and billing totals may be incomplete.</div>}
          {showShopifyWarning && <div>⚠ Shopify billing may be incomplete. Expected activity has no uploaded invoice.</div>}
          {showMetaWarning && <div>⚠ Meta Ads billing may be incomplete. Expected spend has no uploaded invoice.</div>}
          {showShiprocketWarning && <div>⚠ Shiprocket billing may be incomplete. Expected statement charges have no uploaded invoice.</div>}
        </div>
      )}

      {/* KPI totals summary */}
      <div className="meta-kpi-grid" style={{ marginBottom: "20px" }}>
        <MetaMoneyKpiCard label="MONTHLY EXPENSE" value={summary?.totalExpense} currency={currency} detail="Billed invoices sum" />
        <MetaMoneyKpiCard label="META ADS INVOICED" value={getProviderTotal("META")} currency={currency} detail={`${getProviderBillCount("META")} bills · ${getProviderCompleteness("META")}`} />
        <MetaMoneyKpiCard label="SHIPROCKET INVOICED" value={getProviderTotal("SHIPROCKET")} currency={currency} detail={`${getProviderBillCount("SHIPROCKET")} bills · ${getProviderCompleteness("SHIPROCKET")}`} />
        <MetaMoneyKpiCard label="SHOPIFY INVOICED" value={getProviderTotal("SHOPIFY")} currency={currency} detail={`${getProviderBillCount("SHOPIFY")} bills · ${getProviderCompleteness("SHOPIFY")}`} />
      </div>

      <div style={{ marginBottom: "20px" }}>
        <a 
          href={expensesApi.getBulkDownloadUrl(selectedMonth)} 
          className="button compact" 
          download
          style={{ textDecoration: "none", display: "inline-block" }}
        >
          Download All Bills
        </a>
      </div>

      {/* Provider Details cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "15px", marginBottom: "25px" }}>
        {PROVIDERS.map((p) => {
          const apiSpend = getProviderApiExpense(p.key);
          const billed = getProviderTotal(p.key);
          const diff = getProviderDifference(p.key);
          const count = getProviderBillCount(p.key);

          return (
            <div key={p.key} className="meta-chart-panel" style={{ padding: "15px", background: "var(--panel-bg)", border: "1px solid var(--border)", borderRadius: "8px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "var(--metal)" }}>{p.label}</h3>
                <span className={`status-chip`} style={{ fontSize: "10px", padding: "2px 6px", background: getProviderCompleteness(p.key) === "COMPLETE" ? "rgba(137, 167, 125, 0.2)" : "rgba(200, 150, 0, 0.2)", color: getProviderCompleteness(p.key) === "COMPLETE" ? "var(--success)" : "#b38600" }}>
                  {getProviderCompleteness(p.key)}
                </span>
              </div>
              <div style={{ display: "grid", gap: "6px", fontSize: "12px", color: "var(--muted)" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Billed Expense:</span>
                  <strong style={{ color: "var(--text)" }}>{formatMoneyForCurrency(billed, currency)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>API Expected Spend:</span>
                  <span>{formatMoneyForCurrency(apiSpend, currency)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Difference:</span>
                  <span style={{ color: diff !== 0 ? "#cc3300" : "inherit" }}>{formatMoneyForCurrency(diff, currency)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "6px", marginTop: "4px" }}>
                  <span>Bills Count:</span>
                  <span>{count}</span>
                </div>
              </div>
              <div style={{ marginTop: "12px" }}>
                <a 
                  href={expensesApi.getBulkDownloadUrl(selectedMonth, p.key)} 
                  className="button compact secondary" 
                  download
                  style={{ textDecoration: "none", display: "block", textAlign: "center", fontSize: "11px" }}
                >
                  Download Bills (ZIP)
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bills Table */}
      <div className="meta-table-panel" style={{ marginBottom: "25px" }}>
        <div className="meta-table-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Bills & Invoices ({sortedBills.length})</span>
        </div>
        <div className="table-container" style={{ overflowX: "auto" }}>
          {sortedBills.length === 0 ? (
            <MetaEmptyState message="No bills found for the selected month. Sync expenses or add manual bills to display invoice records." />
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
                {sortedBills.map((b) => (
                  <tr key={b.id} className="meta-row">
                    <td>{new Date(b.invoiceDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</td>
                    <td>{b.provider === "META" ? "Meta Ads" : b.provider === "SHIPROCKET" ? "Shiprocket" : "Shopify"}</td>
                    <td>{b.invoiceNumber}</td>
                    <td>{formatMoneyForCurrency(b.total, b.currency)}</td>
                    <td>
                      {b.status === "AVAILABLE" ? (
                        <a 
                          href={expensesApi.getBillDownloadUrl(b.id)} 
                          className="button compact secondary" 
                          download
                          style={{ textDecoration: "none" }}
                        >
                          Download
                        </a>
                      ) : (
                        <span style={{ fontSize: "11px", color: "var(--muted)", fontStyle: "italic" }}>Document unavailable</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Monthly Expense History */}
      <div className="meta-table-panel" style={{ maxWidth: "500px" }}>
        <div className="meta-table-title">Monthly Expense History</div>
        <div className="table-container">
          {history.length === 0 ? (
            <div style={{ padding: "15px", color: "var(--muted)", fontSize: "12px" }}>No historical totals computed.</div>
          ) : (
            <table className="data-table meta-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Total Billed Expense</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.month}>
                    <td>{formatMonthName(h.month)}</td>
                    <td style={{ fontWeight: "600" }}>{formatMoneyForCurrency(h.totalExpense, h.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Manual Upload Modal Dialog overlay */}
      {showAddBill && (
        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="modal-content" style={{ background: "var(--panel-bg)", border: "1px solid var(--border)", padding: "20px", borderRadius: "8px", width: "100%", maxWidth: "450px", color: "var(--text)" }}>
            <h3 style={{ marginTop: 0, marginBottom: "15px", borderBottom: "1px solid var(--border)", paddingBottom: "10px" }}>Add Merchant Bill</h3>
            
            {formError && <div className="error-banner" style={{ marginBottom: "15px" }}>{formError}</div>}
            {formSuccess && <div className="info-banner" style={{ background: "rgba(137,167,125,0.1)", border: "1px solid var(--success)", color: "var(--success)", padding: "10px", borderRadius: "4px", marginBottom: "15px" }}>{formSuccess}</div>}

            <form onSubmit={handleAddBillSubmit} style={{ display: "grid", gap: "12px" }}>
              <label style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
                <span>Provider *</span>
                <select value={formProvider} onChange={(e) => setFormProvider(e.target.value)} style={{ padding: "6px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}>
                  <option value="META">Meta Ads</option>
                  <option value="SHIPROCKET">Shiprocket</option>
                  <option value="SHOPIFY">Shopify</option>
                </select>
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
                  <span>Invoice Number *</span>
                  <input type="text" required value={formInvoiceNumber} onChange={(e) => setFormInvoiceNumber(e.target.value)} placeholder="META-1234" style={{ padding: "6px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </label>
                <label style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
                  <span>Invoice Date *</span>
                  <input type="date" required value={formInvoiceDate} onChange={(e) => setFormInvoiceDate(e.target.value)} style={{ padding: "6px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <label style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
                  <span>Billing Month *</span>
                  <input type="text" required value={formBillingMonth} onChange={(e) => setFormBillingMonth(e.target.value)} placeholder="YYYY-MM" style={{ padding: "6px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </label>
                <label style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
                  <span>Currency *</span>
                  <input type="text" required value={formCurrency} onChange={(e) => setFormCurrency(e.target.value)} placeholder="INR" style={{ padding: "6px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </label>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
                <label style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
                  <span>Subtotal</span>
                  <input type="number" step="0.01" value={formSubtotal} onChange={(e) => setFormSubtotal(e.target.value)} placeholder="0.00" style={{ padding: "6px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </label>
                <label style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
                  <span>Tax Amount</span>
                  <input type="number" step="0.01" value={formTax} onChange={(e) => setFormTax(e.target.value)} placeholder="0.00" style={{ padding: "6px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </label>
                <label style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
                  <span>Total Amount *</span>
                  <input type="number" step="0.01" required value={formTotal} onChange={(e) => setFormTotal(e.target.value)} placeholder="0.00" style={{ padding: "6px", borderRadius: "4px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
                </label>
              </div>

              <label style={{ display: "grid", gap: "4px", fontSize: "12px" }}>
                <span>Upload Document (PDF, PNG, JPG)</span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={handleFileChange} style={{ padding: "6px", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }} />
              </label>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "15px", borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
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
