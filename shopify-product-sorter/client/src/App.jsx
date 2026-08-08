import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./sorterApi";
import ErrorBoundary from "./ErrorBoundary.js";
import OrderMapping from "./OrderMapping";
import SkuImageManager from "./SkuImageManager";
import Sorter from "./Sorter";

import { sidebarModules } from "./sidebarModules.js";
import NetworkActivity from "./NetworkActivity";
import SystemDiagnostics from "./SystemDiagnostics";


export default function App() {
  const [activeModule, setActiveModule] = useState("sorter");
  const [networkLogs, setNetworkLogs] = useState([]);
  const [actionLogs, setActionLogs] = useState([]);
  const [logsError, setLogsError] = useState("");
  const initialCollectionsLoadedRef = useRef(false);
  const [diagnostics, setDiagnostics] = useState({
    collectionsLoaded: 0,
    productsLoaded: 0,
    selectedCollection: "None",
    selectedCollectionId: "None",
    lastApiCall: "None",
    lastApiPayload: "None",
    lastApiStatus: "idle",
    lastApiTimestamp: null,
    logs: [],
  });
  const [skuSidebarState, setSkuSidebarState] = useState({
    diagnostics: {
      activeModule: "SKU Image Manager",
      loadedSkuRows: 0,
      uniqueParentProducts: 0,
      selectedProducts: 0,
      currentEditingProduct: "None",
      currentEditingSku: "None",
      currentImageCount: 0,
      lastSkuApiAction: "None",
      lastShopifyMediaAction: "None",
      lastActionStatus: "idle",
      lastError: "None",
      requiredScopesStatus: "Unknown",
      lastRefreshTime: null,
      bulkModeOpen: false,
      actionRunning: false,
    },
    logs: [],
  });
  const [actualSalesSidebarState, setActualSalesSidebarState] = useState({
    diagnostics: {
      activeModule: "Order Mapping",
      loadedOrders: "Not synced",
      ordersWithAwb: "Unknown",
      matchedOrders: "Unknown",
      unmatchedShiprocketOrders: "Unknown",
      historicalOrders: "Unknown",
      deliveredOrders: "Unknown",
      rtoOrders: "Unknown",
      activeOrders: "Unknown",
      pendingOrders: "Unknown",
      shiprocketStatus: "Not synced",
      lastRefreshTime: null,
      lastActionStatus: "idle",
      lastError: "None",
    },
    logs: [],
  });
  const [orderMappingLogTab, setOrderMappingLogTab] = useState("activity");

  // Single canonical capability source: readiness is fetched once at startup
  // (StrictMode-safe via ref) and drives the app header and Product Sorter.
  const [readiness, setReadiness] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const readinessFetchedRef = useRef(false);

  const fetchReadiness = useCallback(async () => {
    setReadinessLoading(true);
    try {
      const result = await api.getReadiness();
      setReadiness(result);
    } catch (err) {
      setReadiness({
        ok: false,
        status: "unreachable",
        shopify: {
          available: false,
          status: "unavailable",
          reasonCategory: "configuration_missing",
          authMode: null,
          missingVariables: [],
        },
        orderMapping: { available: false, status: "unavailable" },
        error: err.message,
      });
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  useEffect(() => {
    if (readinessFetchedRef.current) {
      return;
    }
    readinessFetchedRef.current = true;
    fetchReadiness();
  }, [fetchReadiness]);

  const shopifyCapability = readiness?.shopify ?? null;

  const sorterSidebarBridge = useMemo(() => {
    let currentVal = { diagnostics: {} };
    return {
      get current() {
        return currentVal;
      },
      set current(val) {
        currentVal = val;
        if (val?.diagnostics) {
          setTimeout(() => {
            setDiagnostics((prev) => ({
              ...prev,
              collectionsLoaded: val.diagnostics.collectionsLoaded,
              productsLoaded: val.diagnostics.productsLoaded,
              selectedCollection: val.diagnostics.selectedCollection,
              selectedCollectionId: val.diagnostics.selectedCollectionId,
            }));
          }, 0);
        }
      }
    };
  }, []);



  async function refreshSorterLogs() {
    try {
      const [actionResult, networkResult] = await Promise.all([
        api.getActionLogs({ limit: 30 }),
        api.getNetworkLogs({ limit: 30 }),
      ]);
      setActionLogs(actionResult.logs || []);
      setNetworkLogs(networkResult.logs || []);
      setLogsError("");
    } catch (loadLogsError) {
      setLogsError(loadLogsError.message);
    }
  }

  useEffect(() => {
    if (initialCollectionsLoadedRef.current) {
      return;
    }
    initialCollectionsLoadedRef.current = true;
    refreshSorterLogs();
  }, []);

  useEffect(() => {
    if (activeModule !== "sorter") {
      return;
    }

    const interval = window.setInterval(() => {
      refreshSorterLogs();
    }, 4000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeModule]);

function clearCurrentLogs() {
  if (activeModule === "sku-image-manager") {
    setSkuSidebarState((prev) => ({ ...prev, logs: [] }));
    return;
  }

  if (activeModule === "order-mapping") {
    setActualSalesSidebarState((prev) => ({ ...prev, logs: [] }));
    return;
  }

  setActionLogs([]);
  setNetworkLogs([]);
}

  function pushSkuLog(entry) {
    setSkuSidebarState((prev) => ({
      ...prev,
      logs: [entry, ...prev.logs].slice(0, 80),
    }));
  }

  function updateSkuDiagnostics(patch) {
    setSkuSidebarState((prev) => ({
      ...prev,
      diagnostics: {
        ...prev.diagnostics,
        ...patch,
      },
    }));
  }

  const replaceActualSalesLogs = useCallback((entries) => {
    setActualSalesSidebarState((prev) => ({
      ...prev,
      logs: Array.isArray(entries) ? entries.slice(0, 40) : [],
    }));
  }, []);

  const updateActualSalesDiagnostics = useCallback((patch) => {
    setActualSalesSidebarState((prev) => ({
      ...prev,
      diagnostics: {
        ...prev.diagnostics,
        ...patch,
      },
    }));
  }, []);

  const orderMappingSidebarBridge = useMemo(
    () => ({
      updateDiagnostics: updateActualSalesDiagnostics,
      replaceLogs: replaceActualSalesLogs,
    }),
    [replaceActualSalesLogs, updateActualSalesDiagnostics],
  );

  const currentLogs =
    activeModule === "sku-image-manager"
      ? skuSidebarState.logs
      : activeModule === "order-mapping"
        ? actualSalesSidebarState.logs
        : [...actionLogs, ...networkLogs]
            .sort((left, right) => {
              const leftTime = new Date(left.timestamp || left.startedAt || 0).getTime();
              const rightTime = new Date(right.timestamp || right.startedAt || 0).getTime();
              return rightTime - leftTime;
            })
            .map((log) =>
              log.actionType
                ? {
                    timestamp: log.timestamp,
                    status: log.status,
                    module: "activity",
                    actionType: log.actionType,
                    message: log.actionLabel,
                    endpoint: log.collectionTitle || "",
                    error: log.errorMessage || "",
                  }
                : {
                    timestamp: log.startedAt,
                    status: log.status,
                    module: "network",
                    actionType: log.operationName,
                    message: log.collectionTitle || log.endpoint || "",
                    endpoint: log.endpoint || "",
                    error: log.errorMessage || "",
                  },
            )
            .slice(0, 40);
  const visibleLogs =
    activeModule === "order-mapping"
      ? currentLogs.filter((log) =>
          orderMappingLogTab === "activity" ? log.module === "activity" : log.module !== "activity",
        )
      : currentLogs;



  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-brand">
          <h2 className="app-header-title">Product Sorter</h2>
          <p className="app-header-subtitle">Entitled Club internal operations</p>
        </div>
        <div className="app-header-states">
          <span className={`state-chip ${readiness?.status === "unreachable" ? "state-error" : "state-ok"}`}>
            Backend: {readinessLoading ? "Checking…" : readiness?.status === "unreachable" ? "Unreachable" : "Running"}
          </span>
          <span className={`state-chip ${shopifyCapability?.available ? "state-ok" : "state-warn"}`}>
            Shopify: {readinessLoading ? "Checking…" : shopifyCapability?.available ? "Connected" : "Not configured"}
          </span>
          <button type="button" className="button compact" onClick={fetchReadiness} disabled={readinessLoading}>
            {readinessLoading ? "Refreshing…" : "Retry / Refresh"}
          </button>
        </div>
      </header>
      <div className="app-body">
      <aside className={`sidebar ${activeModule === "order-mapping" ? "sidebar--order-mapping" : ""}`}>
        <div className="sidebar-brand">
          <p className="eyebrow">Entitled Club</p>
          <h1>Placement Manager</h1>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-group-label">Core Modules</div>
          {sidebarModules.map((item) => (
            <button
              className={`nav-item ${activeModule === item.id ? "active" : ""} ${!item.enabled ? "disabled" : ""}`}
              key={item.id}
              type="button"
              disabled={!item.enabled}
              onClick={() => item.enabled && setActiveModule(item.id)}
            >
              <span className="nav-label">{item.label}</span>
              {!item.enabled ? <span className="nav-badge">Later</span> : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className={`diagnostics-toggle-button ${activeModule === "diagnostics" ? "active" : ""}`}
            onClick={() => setActiveModule("diagnostics")}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: activeModule === "diagnostics" ? "#0066cc" : "transparent",
              color: activeModule === "diagnostics" ? "#fff" : "#666",
              border: "1px solid #ddd",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              textAlign: "center"
            }}
          >
            System Diagnostics
          </button>
        </div>
      </aside>

      {activeModule === "sorter" ? (
        <ErrorBoundary key="sorter">
          <Sorter
            sidebarBridge={sorterSidebarBridge}
            capability={shopifyCapability}
            readinessLoading={readinessLoading}
            orderMapping={readiness?.orderMapping ?? null}
            onRetryConnection={fetchReadiness}
          />
        </ErrorBoundary>
      ) : activeModule === "order-mapping" ? (
        <ErrorBoundary key="order-mapping">
          <OrderMapping sidebarBridge={orderMappingSidebarBridge} />
        </ErrorBoundary>
      ) : activeModule === "network" ? (
        <ErrorBoundary key="network">
          <main className="dashboard">
            <NetworkActivity />
          </main>
        </ErrorBoundary>
      ) : activeModule === "diagnostics" ? (
        <ErrorBoundary key="diagnostics">
          <main className="dashboard">
            <SystemDiagnostics />
          </main>
        </ErrorBoundary>
      ) : (
        <ErrorBoundary key="sku-image-manager">
          <main className="dashboard">
            <SkuImageManager
              sidebarBridge={{
                updateDiagnostics: updateSkuDiagnostics,
                pushLog: pushSkuLog,
              }}
            />
          </main>
        </ErrorBoundary>
      )}
      </div>
    </div>
  );
}

