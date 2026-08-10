import React, { useEffect, useMemo, useState } from "react";
import { expensesApi } from "./expensesApi.js";
import {
  buildImportFieldDescriptors,
  formatExpenseMonthLabel,
  getExpenseProviderLabel,
  isImportItemReady,
  isRequiredImportField,
  isValidExpenseProvider,
} from "./expensesView.js";

const FIELD_DESCRIPTORS = buildImportFieldDescriptors();

function normalizePreview(preview) {
  return {
    ...preview,
    provider: preview.provider || "NEEDS_REVIEW",
    invoiceNumber: preview.invoiceNumber || "",
    invoiceDate: preview.invoiceDate || "",
    billingMonth: preview.billingMonth || "",
    subtotal: preview.subtotal ?? "",
    tax: preview.tax ?? "",
    total: preview.total ?? "",
    currency: preview.currency || "",
    saveError: "",
  };
}

function getFieldClassName(item, key) {
  const status = item.fieldStatus?.[key];
  const required = isRequiredImportField(key);
  const missingRequired = required && String(item[key] ?? "").trim() === "";
  if (missingRequired || status === "LOW" || status === "MISSING") {
    return "expenses-import-input needs-review";
  }
  return "expenses-import-input";
}

export default function ExpenseBillImportModal({
  isOpen,
  selectedMonth,
  preferredProvider = null,
  onClose,
  onSaved,
}) {
  const [files, setFiles] = useState([]);
  const [items, setItems] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const readyItems = useMemo(
    () => items.filter((item) => isImportItemReady(item) && !item.duplicateInvoice && !item.duplicateDocument),
    [items],
  );

  useEffect(() => {
    if (!isOpen) {
      setFiles([]);
      setItems([]);
      setUploading(false);
      setSaving(false);
      setError("");
      setMessage("");
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const cleanupPreviewImports = async () => {
    const importIds = items.map((item) => item.importId).filter(Boolean);
    if (importIds.length > 0) {
      await expensesApi.cancelBillImport(importIds).catch(() => {});
    }
  };

  const handleClose = async () => {
    await cleanupPreviewImports();
    onClose();
  };

  const handleFileSelection = (event) => {
    setFiles(Array.from(event.target.files || []));
  };

  const handlePreview = async () => {
    if (files.length === 0) {
      setError("Select at least one PDF, PNG, or JPG bill to review.");
      return;
    }
    setUploading(true);
    setError("");
    setMessage("");
    try {
      const formData = new FormData();
      formData.append("selectedMonth", selectedMonth);
      if (preferredProvider && isValidExpenseProvider(preferredProvider)) {
        formData.append("preferredProvider", preferredProvider);
      }
      for (const file of files) {
        formData.append("files", file);
      }

      const response = await expensesApi.previewBillImport(formData);
      setItems((response.previews || []).map(normalizePreview));
      setMessage(`${response.previews?.length || 0} bill${response.previews?.length === 1 ? "" : "s"} ready for review.`);
    } catch (err) {
      setError(err.message || "Failed to preview bill import.");
    } finally {
      setUploading(false);
    }
  };

  const updateItem = (importId, key, value) => {
    setItems((current) => current.map((item) => (item.importId === importId ? { ...item, [key]: value, saveError: "" } : item)));
  };

  const applySaveResult = async (result) => {
    const savedIds = new Set((result.saved || []).map((entry) => entry.importId));
    const failedMap = new Map((result.failed || []).map((entry) => [entry.importId, entry]));
    if (savedIds.size > 0) {
      setItems((current) => current
        .filter((item) => !savedIds.has(item.importId))
        .map((item) => (failedMap.has(item.importId) ? { ...item, saveError: failedMap.get(item.importId).message } : item)));
      await onSaved((result.saved || []).map((entry) => entry.bill).filter(Boolean));
    } else {
      setItems((current) => current.map((item) => (failedMap.has(item.importId) ? { ...item, saveError: failedMap.get(item.importId).message } : item)));
    }

    if ((result.failed || []).length > 0) {
      setError("Some bills still need review before they can be saved.");
    } else {
      setError("");
    }

    if ((result.saved || []).length > 0) {
      setMessage(`Saved ${(result.saved || []).length} bill${result.saved.length === 1 ? "" : "s"}.`);
    }

    if (savedIds.size > 0 && items.length === savedIds.size) {
      await handleClose();
    }
  };

  const saveItems = async (selectedItems) => {
    if (selectedItems.length === 0) {
      setError("No valid bills are ready to save.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = selectedItems.map((item) => ({
        importId: item.importId,
        provider: item.provider,
        invoiceNumber: item.invoiceNumber,
        invoiceDate: item.invoiceDate,
        billingMonth: item.billingMonth,
        subtotal: item.subtotal,
        tax: item.tax,
        total: item.total,
        currency: item.currency,
      }));
      const result = await expensesApi.confirmBillImport(payload);
      await applySaveResult(result);
    } catch (err) {
      setError(err.message || "Failed to save reviewed bills.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay expenses-modal-overlay">
      <div className="modal-content expenses-modal expenses-import-modal">
        <div className="expenses-import-header">
          <div>
            <h3 className="expenses-modal-title">Upload Bills</h3>
            <p className="expenses-import-subtitle">
              Upload bill documents for {formatExpenseMonthLabel(selectedMonth)}. Extracted values stay editable until you confirm the save.
            </p>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {message && <div className="info-banner expenses-success-banner">{message}</div>}

        {items.length === 0 ? (
          <div className="expenses-import-start">
            <label className="expenses-field" htmlFor="expenses-import-files">
              <span>Select Bill Documents</span>
              <input
                id="expenses-import-files"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                multiple
                onChange={handleFileSelection}
              />
            </label>
            <div className="expenses-import-start-copy">
              Supported: PDF, PNG, JPG, JPEG. Machine-readable PDFs use embedded text first. OCR is only used when necessary.
            </div>
            <div className="expenses-modal-actions">
              <button type="button" className="button compact secondary" onClick={handleClose}>Cancel</button>
              <button type="button" className="button compact" onClick={handlePreview} disabled={uploading}>
                {uploading ? "Extracting…" : "Review Uploaded Bills"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="expenses-import-review-list">
              {items.map((item) => (
                <div key={item.importId} className="meta-chart-panel expenses-import-card">
                  <div className="expenses-import-card-header">
                    <div>
                      <strong>{item.filename}</strong>
                      <div className="expenses-history-empty-copy">Document hash tracked for duplicate detection.</div>
                    </div>
                    <button
                      type="button"
                      className="button compact secondary"
                      onClick={() => saveItems([item])}
                      disabled={saving || !isImportItemReady(item) || Boolean(item.duplicateInvoice) || Boolean(item.duplicateDocument)}
                    >
                      Confirm &amp; Save
                    </button>
                  </div>

                  {(item.extractionWarnings || []).length > 0 && (
                    <div className="expenses-import-warning-list">
                      {(item.extractionWarnings || []).map((warning) => (
                        <div key={warning} className="expenses-history-empty-copy">{warning}</div>
                      ))}
                    </div>
                  )}

                  {item.duplicateInvoice && (
                    <div className="error-banner">
                      This invoice already exists: {item.duplicateInvoice.invoiceNumber} · {item.duplicateInvoice.invoiceDate}
                    </div>
                  )}

                  {item.duplicateDocument && (
                    <div className="error-banner">
                      This document hash already exists for {item.duplicateDocument.provider} {item.duplicateDocument.invoiceNumber}.
                    </div>
                  )}

                  {item.saveError && <div className="error-banner">{item.saveError}</div>}

                  <div className="expenses-import-grid">
                    {FIELD_DESCRIPTORS.map((field) => (
                      <label key={field.key} className={`expenses-field expenses-import-field${isRequiredImportField(field.key) ? " is-required" : ""}`}>
                        <span>{field.label}{isRequiredImportField(field.key) ? " *" : ""}</span>
                        {field.type === "select" ? (
                          <select
                            name={`${item.importId}-${field.key}`}
                            value={item[field.key]}
                            className={getFieldClassName(item, field.key)}
                            onChange={(event) => updateItem(item.importId, field.key, event.target.value)}
                          >
                            <option value="NEEDS_REVIEW">Needs review</option>
                            <option value="META">{getExpenseProviderLabel("META")}</option>
                            <option value="SHIPROCKET">{getExpenseProviderLabel("SHIPROCKET")}</option>
                            <option value="SHOPIFY">{getExpenseProviderLabel("SHOPIFY")}</option>
                          </select>
                        ) : (
                          <input
                            name={`${item.importId}-${field.key}`}
                            type={field.type}
                            step={field.type === "number" ? "0.01" : undefined}
                            value={item[field.key]}
                            placeholder={field.placeholder || ""}
                            className={getFieldClassName(item, field.key)}
                            onChange={(event) => updateItem(item.importId, field.key, event.target.value)}
                          />
                        )}
                        {(item.fieldWarnings?.[field.key] || []).map((warning) => (
                          <small key={warning} className="expenses-import-field-note">{warning}</small>
                        ))}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="expenses-modal-actions">
              <button type="button" className="button compact secondary" onClick={handleClose}>Cancel</button>
              <button
                type="button"
                className="button compact"
                onClick={() => saveItems(readyItems)}
                disabled={saving || readyItems.length === 0}
              >
                {saving ? "Saving…" : `Save All Valid Bills (${readyItems.length})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
