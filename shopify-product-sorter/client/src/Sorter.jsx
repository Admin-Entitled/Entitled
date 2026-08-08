import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, validateApplyOrderIds } from "./sorterApi";
import GeneratedOrderPreview from "./GeneratedOrderPreview.jsx";
import { defaultFilters, getAllocationState, matchesFilters } from "./sorterFilters.js";
import { INITIAL_SETTINGS, STRATEGY_PRESETS, weightFields } from "./strategySchema.js";
import { formatDate, formatMoney } from "./utils/format.js";

const emptyPreview = {
  newOrder: [],
  previewUrl: null,
  previewVersion: null,
};

const fallbackImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Crect fill='%23f5f5f5' width='200' height='200'/%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-size='16' fill='%23999' text-anchor='middle' dy='.3em'%3ENo image%3C/text%3E%3C/svg%3E";


export default function Sorter({ sidebarBridge, capability = null, readinessLoading = false, orderMapping = null, onRetryConnection }) {
  const [collections, setCollections] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [settings, setSettings] = useState(INITIAL_SETTINGS);
  // Track last saved settings from backend to detect dirty/unsaved state
  const [savedSettings, setSavedSettings] = useState(INITIAL_SETTINGS);
  const [filters, setFilters] = useState(defaultFilters);
  const [preview, setPreview] = useState(emptyPreview);
  const [manualOrder, setManualOrder] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [previewStale, setPreviewStale] = useState(false);
  const [presetName, setPresetName] = useState("Balanced");
  const [expandedScoreIds, setExpandedScoreIds] = useState({});
  const [backup, setBackup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [reorderAllSummary, setReorderAllSummary] = useState(null);
  // Global sync state: null = never synced, object = last sync result
  const [globalSyncStatus, setGlobalSyncStatus] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [strategyMessage, setStrategyMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // strategyUsed: populated from Generate response; represents what backend actually used.
  // Never derived from current UI state.
  const [strategyUsed, setStrategyUsed] = useState(null);

  // One-shot guards: fetch readiness/collections exactly once per availability
  // state and ignore stale results after unmount (StrictMode-safe).
  const collectionsFetchedRef = useRef(false);
  const mountedRef = useRef(true);
  // In-flight guard so a double-click can never issue concurrent apply
  // requests to the Shopify write endpoint.
  const applyInProgressRef = useRef(false);

  const products = snapshot?.products || [];

  const applyPreset = (name) => {
    if (STRATEGY_PRESETS[name]) {
      setSettings(prev => ({ ...prev, ...STRATEGY_PRESETS[name] }));
      setPresetName(name);
      setPreviewStale(true);
    }
  };

  // Helper to compute sum of weights in percentage (0 to 100)
  const strategyTotalPercent = () => {
    const total = weightFields.reduce((sum, field) => sum + Math.round((Number(settings[field.key]) || 0) * 100), 0);
    return total;
  };

  const isStrategyValid = strategyTotalPercent() === 100;

  // Helper to check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    const weightsDirty = weightFields.some((field) => {
      const currentVal = Math.round((Number(settings[field.key]) || 0) * 100);
      const savedVal = Math.round((Number(savedSettings[field.key]) || 0) * 100);
      return currentVal !== savedVal;
    });
    const overrideDirty = Boolean(settings.override) !== Boolean(savedSettings.override);
    return weightsDirty || overrideDirty;
  }, [settings, savedSettings]);

  const isStrategyMismatched = useMemo(() => {
    return Boolean(savedSettings?.hash && strategyUsed?.hash && savedSettings.hash !== strategyUsed.hash);
  }, [savedSettings?.hash, strategyUsed?.hash]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCollections = useCallback(async () => {
    setCollectionsLoading(true);
    setError("");
    try {
      const response = await api.getCollections();
      if (mountedRef.current) {
        setCollections(response.collections || []);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setCollectionsLoading(false);
      }
    }
  }, []);

  // Request collections exactly once when Shopify becomes available. No
  // automatic retries; retries are explicit and operator-initiated.
  useEffect(() => {
    if (!capability?.available) {
      return;
    }
    if (collectionsFetchedRef.current) {
      return;
    }
    collectionsFetchedRef.current = true;
    loadCollections();
  }, [capability, loadCollections]);

  // While unavailable, keep the one-shot guard open so a single Retry
  // connection (after configuration is added) fetches collections once.
  useEffect(() => {
    if (!capability?.available) {
      collectionsFetchedRef.current = false;
    }
  }, [capability]);

  useEffect(() => {
    if (sidebarBridge) {
      sidebarBridge.current = {
        diagnostics: {
          collectionsLoaded: collections.length,
          productsLoaded: products.length,
          selectedCollection: snapshot?.collection?.title || "None",
          selectedCollectionId: selectedCollectionId || "None",
        },
      };
    }
  }, [sidebarBridge, collections.length, products.length, snapshot, selectedCollectionId]);

  const vendorOptions = useMemo(
    () => ["all", ...new Set(products.map((product) => product.vendor).filter(Boolean))],
    [products],
  );

  const statusOptions = useMemo(
    () => ["all", ...new Set(products.map((product) => product.status).filter(Boolean))],
    [products],
  );

  const filteredProducts = useMemo(
    () =>
      products
        .filter((product) => matchesFilters(product, filters))
        .sort((left, right) => left.collectionPosition - right.collectionPosition),
    [products, filters],
  );

  const previewTop = manualOrder.slice(0, settings.firstPageLimit || 40);

  function mergeSettingsFromResponse(responseSettings) {
    if (!responseSettings) {
      return;
    }
    const updateState = (prev) => {
      const next = { ...prev };
      for (const field of weightFields) {
        const value = Number(responseSettings[field.key]);
        if (Number.isFinite(value) && value >= 0) {
          next[field.key] = value;
        }
      }
      if (responseSettings.override !== undefined) {
        next.override = Boolean(responseSettings.override);
      }
      const limit = Number(responseSettings.firstPageLimit);
      if (Number.isFinite(limit) && limit >= 1) {
        next.firstPageLimit = limit;
      }
      if (responseSettings.hash !== undefined) {
        next.hash = responseSettings.hash;
      }
      if (responseSettings.version !== undefined) {
        next.version = responseSettings.version;
      }
      if (responseSettings.source !== undefined) {
        next.source = responseSettings.source;
      }
      if (responseSettings.preset !== undefined) {
        next.preset = responseSettings.preset;
      }
      return next;
    };
    setSettings(updateState);
    setSavedSettings(updateState);
  }

  const handleCollectionSelect = useCallback(async (collectionId) => {
    if (!collectionId) {
      setSelectedCollectionId("");
      setSnapshot(null);
      setPreview(emptyPreview);
      setPreviewStale(false);
      return;
    }

    setSelectedCollectionId(collectionId);
    setLoading(true);
    setError("");
    setPreview(emptyPreview);
    setManualOrder([]);
    setPreviewStale(false);

    try {
      const response = await api.getCollectionSnapshot(collectionId);
      if (mountedRef.current) {
        setSnapshot(response.snapshot || null);
        mergeSettingsFromResponse(response.settings);
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const saveSettings = useCallback((newSettings) => {
    setSettings(newSettings);
  }, []);

  /**
   * Global sync handler: synchronizes ALL Shopify collections and their
   * product data regardless of which collection is currently selected.
   *
   * After sync completes, if a collection was previously selected its snapshot
   * is refreshed from the cache so the view stays current.
   */
  const handleSync = useCallback(async () => {
    setIsSyncing(true);
    setError("");
    setMessage("");

    try {
      const response = await api.syncAllCollections();
      if (!mountedRef.current) return;

      setGlobalSyncStatus(response);

      // Also refresh the collections list so any new collections appear
      await loadCollections();

      // Refresh the selected collection's snapshot if one is selected
      if (selectedCollectionId && mountedRef.current) {
        try {
          const stateResponse = await api.getCollectionSnapshot(selectedCollectionId);
          if (mountedRef.current) {
            setSnapshot(stateResponse.snapshot || null);
            mergeSettingsFromResponse(stateResponse.settings);
            setPreview(emptyPreview);
            setManualOrder([]);
            setPreviewStale(false);
          }
        } catch {
          // snapshot refresh failure is non-fatal; the global sync succeeded
        }
      }

      if (mountedRef.current) {
        if (!response.ok) {
          setError(
            `${response.failed} collection${response.failed === 1 ? "" : "s"} failed to sync. ` +
            response.results
              .filter((r) => r.status === "failed")
              .map((r) => r.collectionTitle || r.collectionId)
              .join(", "),
          );
        } else {
          setMessage(`${response.synced} collection${response.synced === 1 ? "" : "s"} synced`);
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setIsSyncing(false);
      }
    }
  }, [selectedCollectionId, loadCollections]);

  const handleSaveStrategy = useCallback(async () => {
    const targetCollectionId = selectedCollectionId || "__global__";
    const total = strategyTotalPercent();
    if (total !== 100) {
      setStrategyMessage(`Strategy weights must total 100% (currently ${total}%).`);
      return;
    }
    setLoading(true);
    setError("");
    setStrategyMessage("");

    const updatePayload = {
      salesWeight: Number(settings.salesWeight),
      revenueWeight: Number(settings.revenueWeight),
      inventoryWeight: Number(settings.inventoryWeight),
      newnessWeight: Number(settings.newnessWeight),
      momentumWeight: Number(settings.momentumWeight),
      rotationWeight: Number(settings.rotationWeight),
      override: Boolean(settings.override),
    };

    try {
      const response = await api.updateSettings(targetCollectionId, updatePayload);
      if (mountedRef.current) {
        // Use server-returned canonical settings as truth.
        const serverSettings = response?.settings || {};
        const updateState = (prev) => ({
          ...prev,
          ...updatePayload,
          ...(serverSettings.salesWeight !== undefined ? { salesWeight: Number(serverSettings.salesWeight) } : {}),
          ...(serverSettings.revenueWeight !== undefined ? { revenueWeight: Number(serverSettings.revenueWeight) } : {}),
          ...(serverSettings.inventoryWeight !== undefined ? { inventoryWeight: Number(serverSettings.inventoryWeight) } : {}),
          ...(serverSettings.newnessWeight !== undefined ? { newnessWeight: Number(serverSettings.newnessWeight) } : {}),
          ...(serverSettings.momentumWeight !== undefined ? { momentumWeight: Number(serverSettings.momentumWeight) } : {}),
          ...(serverSettings.rotationWeight !== undefined ? { rotationWeight: Number(serverSettings.rotationWeight) } : {}),
          ...(serverSettings.override !== undefined ? { override: Boolean(serverSettings.override) } : {}),
          ...(serverSettings.hash !== undefined ? { hash: serverSettings.hash } : {}),
          ...(serverSettings.version !== undefined ? { version: serverSettings.version } : {}),
          ...(serverSettings.source !== undefined ? { source: serverSettings.source } : {}),
        });
        setSavedSettings(updateState);
        setSettings(updateState);
        // Persisted strategy changes alter future generations; the current
        // preview is no longer representative.
        setPreviewStale(true);
        setMessage("Strategy saved");
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [selectedCollectionId, settings]);

  const handleGenerate = useCallback(async () => {
    if (!snapshot) return;
    if (hasUnsavedChanges) {
      setError("Please save strategy changes before generating Today's Order.");
      return;
    }
    const total = strategyTotalPercent();
    if (total !== 100) {
      setError("Strategy weights must total 100% before generating an order.");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await api.generateOrder(selectedCollectionId, settings);
      if (mountedRef.current) {
        setPreview({
          newOrder: response.newOrder || [],
          previewUrl: response.previewUrl || null,
          previewVersion: response.previewVersion || null,
        });
        setManualOrder(response.newOrder || []);
        setExpandedScoreIds({});
        setPreviewStale(false);
        // Store backend-reported strategy — this is the AUTHORITATIVE source of
        // what strategy was actually used. Frontend must NOT re-derive this.
        if (response.strategyUsed) {
          setStrategyUsed(response.strategyUsed);
        }
        setMessage("Generated order — preview only, nothing written to Shopify");
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [snapshot, selectedCollectionId, settings, hasUnsavedChanges]);

  const handleApply = useCallback(async () => {
    // Double-click protection: never issue a second apply while one is in flight.
    if (applyInProgressRef.current) return;
    if (!manualOrder.length || !preview.previewVersion || previewStale || isStrategyMismatched) return;

    const originalIds = preview.newOrder.map((product) => product.id).sort();
    const manualIds = manualOrder.map(p => p.id).sort();
    
    if (originalIds.length !== manualIds.length || !originalIds.every((id, idx) => id === manualIds[idx])) {
      setError("Manual order contains mismatched or duplicate products compared to the generated order.");
      setMessage("");
      return;
    }

    // Serialize the preview to string product IDs only and validate locally.
    // On failure the request is not sent and the preview stays visible.
    let orderIds;
    try {
      orderIds = validateApplyOrderIds(manualOrder.map((product) => product.id));
    } catch (err) {
      setError(err.message);
      setMessage("");
      return;
    }

    applyInProgressRef.current = true;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await api.applyOrder(selectedCollectionId, orderIds, preview.previewVersion);
      const updated = await api.getCollectionSnapshot(selectedCollectionId);
      if (mountedRef.current) {
        setSnapshot(updated.snapshot || null);
        setBackup({ createdAt: new Date().toISOString(), products: snapshot.products });
        setPreview(emptyPreview);
        setManualOrder([]);
        setPreviewStale(false);
        setMessage("Applied order to Shopify");
      }
    } catch (err) {
      if (mountedRef.current) {
        // Known staleness contract failure: keep the preview visible but
        // disable Apply until a fresh preview is generated.
        if (err.code === "GENERATED_ORDER_STALE" || err.status === 409) {
          setPreviewStale(true);
        }
        setError(err.message);
      }
    } finally {
      applyInProgressRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [preview, selectedCollectionId, snapshot, previewStale, isStrategyMismatched]);

  const handleRollback = useCallback(async () => {
    if (!backup) return;
    setLoading(true);
    setError("");
    setMessage("");

    try {
      await api.applyOrder(
        selectedCollectionId,
        backup.products.map((p) => p.id),
      );
      const updated = await api.getCollectionSnapshot(selectedCollectionId);
      if (mountedRef.current) {
        setSnapshot(updated.snapshot || null);
        setBackup(null);
        setMessage("Rolled back to backup");
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [backup, selectedCollectionId]);

  const handleReorderAllLive = useCallback(async () => {
    setIsSyncingAll(true);
    setError("");
    setMessage("");
    setReorderAllSummary(null);

    try {
      const response = await api.reorderAllCollections();
      if (mountedRef.current) {
        setReorderAllSummary(response);
        if (response.failures && response.failures.length > 0) {
          setError(`Some collections failed: ${response.failures.join(", ")}`);
        } else {
          setMessage("All collections updated successfully");
        }
      }
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message);
      }
    } finally {
      if (mountedRef.current) {
        setIsSyncingAll(false);
      }
    }
  }, []);

  const updateProductAllocation = useCallback(
    async (productId, state) => {
      if (!snapshot) return;

      let allottedPosition = null;
      let includeInRotation = 1;

      if (state === "pinned") {
        const existing = products.filter((p) => p.allottedPosition && p.allottedPosition > 0);
        allottedPosition = existing.length + 1;
        includeInRotation = 1;
      } else if (state === "eligible") {
        allottedPosition = null;
        includeInRotation = 1;
      } else if (state === "hidden") {
        allottedPosition = null;
        includeInRotation = 0;
      }

      const updatedProducts = snapshot.products.map((product) =>
        product.id === productId
          ? { ...product, allottedPosition, includeInRotation: Boolean(includeInRotation) }
          : product,
      );

      setSnapshot({ ...snapshot, products: updatedProducts });
      // Preference changes alter generation inputs; invalidate the preview.
      setPreviewStale(true);

      try {
        await api.updateProduct(selectedCollectionId, productId, {
          allottedPosition,
          includeInRotation: Boolean(includeInRotation),
        });
      } catch (err) {
        setError(err.message);
      }
    },
    [snapshot, selectedCollectionId, products],
  );

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    setManualOrder(prev => {
      const newOrder = [...prev];
      const draggedItem = newOrder[draggedIndex];
      newOrder.splice(draggedIndex, 1);
      newOrder.splice(index, 0, draggedItem);
      return newOrder;
    });
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const moveUp = (index) => {
    if (index === 0) return;
    setManualOrder(prev => {
      const newOrder = [...prev];
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      return newOrder;
    });
  };

  const moveDown = (index) => {
    if (index === manualOrder.length - 1) return;
    setManualOrder(prev => {
      const newOrder = [...prev];
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      return newOrder;
    });
  };

  const isManualOrderModified = preview.newOrder.length > 0 && manualOrder.some((p, i) => p.id !== preview.newOrder[i]?.id);

  const copyVariableTemplate = useCallback(async () => {
    const names = [
      ...new Set([
        ...(capability?.missingVariables || []),
        "SHOPIFY_STORE_DOMAIN",
        "SHOPIFY_ADMIN_ACCESS_TOKEN",
        "SHOPIFY_CLIENT_ID",
        "SHOPIFY_CLIENT_SECRET",
      ]),
    ];
    try {
      await navigator.clipboard.writeText(names.map((name) => `${name}=`).join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard unavailable — copy the variable names manually.");
    }
  }, [capability]);

  if (readinessLoading || capability === null) {
    return (
      <main className="dashboard" aria-busy="true">
        <div className="setup-card panel">
          <p className="eyebrow">Initializing</p>
          <h2>Checking Shopify capability…</h2>
          <p className="setup-subtitle">Contacting the backend once to determine the Shopify connection state.</p>
        </div>
      </main>
    );
  }

  if (capability && !capability.available) {
    const missingVars = capability.missingVariables || ["SHOPIFY_STORE_DOMAIN"];
    const omReady = orderMapping?.status === "ready";
    return (
      <main className="dashboard">
        <section className="setup-card panel" aria-labelledby="setup-title">
          <div className="setup-header">
            <span className="status-badge status-unavailable">Shopify Not Configured</span>
          </div>
          <h2 id="setup-title">Connect Shopify to use Product Sorter</h2>
          <p className="setup-subtitle">
            Product Sorter is running. Shopify access is required to load collections.
          </p>

          <div className="setup-status-grid">
            <div className="setup-status-item">
              <span className="setup-status-label">Backend</span>
              <span className="state-chip state-ok">Running</span>
            </div>
            <div className="setup-status-item">
              <span className="setup-status-label">Shopify</span>
              <span className="state-chip state-warn">Not configured</span>
            </div>
            <div className="setup-status-item">
              <span className="setup-status-label">Order Mapping</span>
              <span className={`state-chip ${omReady ? "state-ok" : "state-muted"}`}>
                {omReady ? "Ready" : "Unavailable (optional)"}
              </span>
            </div>
          </div>

          <div className="setup-details">
            <div className="setup-section">
              <h4>Missing Environment Variables</h4>
              <ul className="missing-vars-list">
                {missingVars.map((v) => (
                  <li key={v} className="missing-var-item">
                    <code>{v}</code>
                  </li>
                ))}
              </ul>
              <p className="setup-note">Variable names only — no credential values are ever sent to the browser.</p>
            </div>

            <div className="setup-section">
              <h4>Supported Authentication Methods</h4>
              <div className="auth-methods-grid">
                <div className="auth-method-card">
                  <h5>Option 1: Admin Access Token (Recommended)</h5>
                  <pre><code>{"SHOPIFY_STORE_DOMAIN=your-store.myshopify.com\nSHOPIFY_ADMIN_ACCESS_TOKEN="}</code></pre>
                </div>
                <div className="auth-method-card">
                  <h5>Option 2: Client Credentials</h5>
                  <pre><code>{"SHOPIFY_STORE_DOMAIN=your-store.myshopify.com\nSHOPIFY_CLIENT_ID=\nSHOPIFY_CLIENT_SECRET="}</code></pre>
                </div>
              </div>
              <p className="setup-note">Optional: SHOPIFY_API_VERSION (defaults to 2026-04).</p>
            </div>

            <details className="setup-instructions">
              <summary>View setup instructions</summary>
              <ol className="setup-steps">
                <li>Copy <code>.env.example</code> to <code>.env</code> at the repository root (or <code>server/.env</code>).</li>
                <li>Set <code>SHOPIFY_STORE_DOMAIN</code> to your store, e.g. <code>your-store.myshopify.com</code>.</li>
                <li>Choose one authentication method and fill in its variables.</li>
                <li>Restart the backend, then press <strong>Retry connection</strong>.</li>
                <li>No secrets are stored in this browser or sent through frontend requests.</li>
              </ol>
            </details>
          </div>

          <div className="setup-actions">
            <button type="button" className="button accent" onClick={onRetryConnection} disabled={readinessLoading}>
              {readinessLoading ? "Checking…" : "Retry connection"}
            </button>
            <button type="button" className="button ghost" onClick={copyVariableTemplate}>
              {copied ? "Copied ✓" : "Copy variable-name template"}
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard" aria-busy={loading || undefined}>
      <section className="topbar panel">
        <div className="topbar-header">
          <div>
            <p className="eyebrow">Shopify</p>
            <h2>Manual collection control with daily smart rotation</h2>
          </div>
          <div className="action-row">
            <button className="button ghost" onClick={handleSync} disabled={isSyncing}>
              {isSyncing ? `Syncing…` : "Sync Live Data"}
            </button>
            <button className="button accent" onClick={handleGenerate} disabled={loading || !snapshot || !isStrategyValid || hasUnsavedChanges}
              title={!snapshot ? "Select a collection and sync data first" : !isStrategyValid ? "Strategy weights must total 100% before generating" : hasUnsavedChanges ? "Please save strategy changes before generating" : "Generate Today's Order"}
            >
              {loading && snapshot ? "Generating…" : "Generate Today's Order"}
            </button>
            <button type="button" className="button metal" onClick={handleReorderAllLive} disabled={isSyncingAll || !collections.length || !isStrategyValid}>
              Update All Collections
            </button>
            <button
              className="button danger"
              onClick={handleApply}
              disabled={
                loading ||
                applyInProgressRef.current ||
                !preview.newOrder.length ||
                !preview.previewVersion ||
                previewStale ||
                isStrategyMismatched ||
                !capability?.available
              }
              title={isStrategyMismatched ? "Strategy mismatch detected" : "Requires a fresh generated preview"}
            >
              Apply Order to Shopify
            </button>
            <button className="button ghost" onClick={handleRollback} disabled={loading || !backup}>
              Rollback Last Backup
            </button>
          </div>
        </div>

        {reorderAllSummary?.failures?.length > 0 && (
          <p className="error-text">
            Failed: {reorderAllSummary.results
              .filter((result) => result.status === "failed")
              .map((result) => `${result.collectionTitle} — ${result.error}`)
              .join("; ")}
          </p>
        )}

        <div className="toolbar-grid">
          <label>
            Collection
            <select
              value={selectedCollectionId}
              onChange={(event) => handleCollectionSelect(event.target.value)}
            >
              <option value="">Select collection</option>
              {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                  {collection.title} ({collection.type})
                </option>
              ))}
            </select>
          </label>

          <label>
            First Page Limit
            <input
              type="number"
              min="1"
              value={settings.firstPageLimit}
              onChange={(event) => {
                saveSettings({
                  ...settings,
                  firstPageLimit: Number(event.target.value || 40),
                });
                // A changed page limit alters generation inputs; invalidate the preview.
                setPreviewStale(true);
              }}
            />
          </label>

          <label>
            Search
            <input
              type="text"
              placeholder="Product or handle"
              value={filters.search}
              onChange={(event) => setFilters({ ...filters, search: event.target.value })}
            />
          </label>

          <label>
            Vendor
            <select
              value={filters.vendor}
              onChange={(event) => setFilters({ ...filters, vendor: event.target.value })}
            >
              {vendorOptions.map((vendor) => (
                <option key={vendor} value={vendor}>
                  {vendor === "all" ? "All vendors" : vendor}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="status-row">
          <span className="status-chip state-ok">Shopify Connected</span>
          <span className="status-chip">
            {isSyncing
              ? "SYNCING…"
              : globalSyncStatus
                ? globalSyncStatus.ok
                  ? `${globalSyncStatus.synced} COLLECTION${globalSyncStatus.synced === 1 ? "" : "S"} SYNCED`
                  : `${globalSyncStatus.synced} / ${globalSyncStatus.totalCollections} SYNCED — ${globalSyncStatus.failed} FAILED`
                : "NOT SYNCED"}
          </span>
          {globalSyncStatus?.syncedAt && !isSyncing ? (
            <span className="muted">Synced: {formatDate(globalSyncStatus.syncedAt)}</span>
          ) : null}
          {backup?.createdAt ? <span className="muted">Backup: {formatDate(backup.createdAt)}</span> : null}
          {collectionsLoading ? <span className="muted">Loading collections…</span> : null}
          {message ? <span className="success-text" role="status">{message}</span> : null}
          {error ? <span className="error-text" role="alert">{error}</span> : null}
          {previewStale && preview.newOrder.length > 0 && !error ? (
            <span className="error-text" role="alert">
              Preview is outdated. Generate a new order before applying.
            </span>
          ) : null}
        </div>
      </section>

      <section className="panel sorter-section">
        <button
          type="button"
          className="section-toggle"
          onClick={() => setStrategyOpen((prev) => !prev)}
          aria-expanded={strategyOpen}
        >
          <span>Strategy Configuration</span>
          <span className="strategy-state-badge" style={{ marginLeft: "auto", marginRight: "12px", fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "4px", backgroundColor: hasUnsavedChanges ? "rgba(199, 104, 104, 0.15)" : "rgba(137, 167, 125, 0.15)", color: hasUnsavedChanges ? "var(--danger)" : "var(--success)" }}>
            {hasUnsavedChanges ? "UNSAVED CHANGES" : "SAVED"}
          </span>
          <span className="toggle-icon">{strategyOpen ? "\u25b2" : "\u25bc"}</span>
        </button>
        {strategyOpen ? (
          <div className="strategy-body">
            {selectedCollectionId ? (
              <div className="strategy-scope-selector" style={{ marginBottom: "16px", display: "flex", gap: "16px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="strategyScope"
                    checked={!settings.override}
                    onChange={() => {
                      setSettings(prev => ({ ...prev, override: false }));
                      setPreviewStale(true);
                    }}
                  />
                  Use Global Strategy
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="strategyScope"
                    checked={settings.override}
                    onChange={() => {
                      setSettings(prev => ({ ...prev, override: true }));
                      setPreviewStale(true);
                    }}
                  />
                  Use Collection Override
                </label>
              </div>
            ) : (
              <div style={{ marginBottom: "16px", fontWeight: "600" }}>Editing Global Strategy</div>
            )}
            <p className="strategy-note muted">
              Weights control how much each factor contributes to the ranking score. They must total exactly 100%.
              Save Strategy persists weights for this collection. Generate Today&apos;s Order always uses the current saved weights.
            </p>
            <div style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
              <label style={{ fontWeight: "bold" }}>Presets:</label>
              <select 
                value={presetName}
                onChange={(e) => applyPreset(e.target.value)}
                style={{ padding: "4px 8px" }}
              >
                <option value="Custom" disabled>Custom</option>
                {Object.keys(STRATEGY_PRESETS).map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="weights-grid">
              {weightFields.map((field) => {
                // Convert fractional backend representation to percentage for display
                const displayVal = Math.round((Number(settings[field.key]) || 0) * 100);
                return (
                  <label key={field.key} title={field.description}>
                    <span className="weight-label">{field.label}</span>
                    {field.description ? <span className="weight-desc muted">{field.description}</span> : null}
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="5"
                        value={displayVal}
                        onChange={(event) => {
                          const percentValue = Math.max(0, Math.min(100, Number(event.target.value || 0)));
                          const fractionalValue = Number((percentValue / 100).toFixed(2));
                          setSettings((prev) => ({ ...prev, [field.key]: fractionalValue }));
                          setPresetName("Custom");
                          setStrategyMessage("");
                          // Weight changes alter generation inputs; invalidate the preview.
                          setPreviewStale(true);
                        }}
                        style={{ width: "80px" }}
                        disabled={selectedCollectionId && !settings.override}
                      />
                      <span style={{ fontSize: "14px", fontWeight: "bold" }}>%</span>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="strategy-footer" style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
              <span className={isStrategyValid ? "success-text" : "error-text"} style={{ fontWeight: "600" }}>
                TOTAL WEIGHT: {strategyTotalPercent()}% {isStrategyValid ? "" : " (Weights must total exactly 100%)"}
              </span>
              {strategyMessage ? <span className="error-text" role="alert">{strategyMessage}</span> : null}
              <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="button ghost compact"
                  onClick={() => applyPreset("Balanced")}
                  disabled={loading || (selectedCollectionId && !settings.override)}
                >
                  Reset to Defaults
                </button>
                <button
                  type="button"
                  className="button compact"
                  onClick={handleSaveStrategy}
                  disabled={loading || !isStrategyValid}
                >
                  Save Strategy
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <GeneratedOrderPreview
        preview={preview}
        previewTop={previewTop}
        isManualOrderModified={isManualOrderModified}
        previewStale={previewStale}
        isStrategyMismatched={isStrategyMismatched}
        strategyUsed={strategyUsed}
        expandedScoreIds={expandedScoreIds}
        onToggleScore={(productId) =>
          setExpandedScoreIds((prev) => ({ ...prev, [productId]: !prev[productId] }))
        }
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnd={handleDragEnd}
        onMoveUp={moveUp}
        onMoveDown={moveDown}
        onResetToGenerated={() => setManualOrder(preview.newOrder)}
        onClear={() => {
          setPreview(emptyPreview);
          setManualOrder([]);
          setPreviewStale(false);
        }}
        fallbackImage={fallbackImage}
      />

      <section className="table-wrapper panel">
        {!snapshot ? (
          <div className="empty-state">
            {globalSyncStatus
              ? "Select a collection to view its products."
              : "Sync live Shopify data, then select a collection to view its products."}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">No products match the current filters.</div>
        ) : (
          <table className="product-table">
            <thead>
              <tr>
                <th>Position</th>
                <th>Product</th>
                <th>Vendor</th>
                <th>Status</th>
                <th>Stock</th>
                <th>Sold (90d)</th>
                <th>Revenue (INR)</th>
                <th>Allocation</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr key={product.id}>
                  <td>{product.collectionPosition}</td>
                  <td>
                    <img
                      src={product.image || fallbackImage}
                      alt=""
                      style={{ width: 40, height: 40, objectFit: "cover" }}
                    />
                    {product.title}
                  </td>
                  <td>{product.vendor}</td>
                  <td>{product.status}</td>
                  <td>{product.inventoryQuantity}</td>
                  <td>{product.soldQuantity}</td>
                  <td>{formatMoney(product.salesRevenue || 0)}</td>
                  <td>
                    <select
                      value={getAllocationState(product)}
                      onChange={(event) => updateProductAllocation(product.id, event.target.value)}
                    >
                      <option value="pinned">Pinned</option>
                      <option value="eligible">Eligible</option>
                      <option value="hidden">Hidden</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
