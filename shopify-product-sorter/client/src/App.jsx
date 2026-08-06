import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./sorterApi";
import ErrorBoundary from "./ErrorBoundary.js";
import OrderMapping from "./OrderMapping";
import SkuImageManager from "./SkuImageManager";
import Sorter from "./Sorter";

import { sidebarModules } from "./sidebarModules.js";


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



  return (
    <div className="app-shell">
      <aside className={`sidebar ${activeModule === "order-mapping" ? "sidebar--order-mapping" : ""}`}>
        <div>
          <p className="eyebrow">Entitled Club</p>
          <h1>Collection Placement Manager</h1>
        </div>

        <nav className="sidebar-nav">
          {sidebarModules.map((item) => (
            <button
              className={`nav-item ${activeModule === item.id ? "active" : ""}`}
              key={item.id}
              type="button"
              disabled={!item.enabled}
              onClick={() => item.enabled && setActiveModule(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="diagnostic-panel">
          <h4 className="diagnostic-title">System Diagnostics</h4>
          <div className="diagnostic-stats">
            {activeModule === "sku-image-manager" ? (
              <>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Module:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.activeModule}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Loaded SKUs:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.loadedSkuRows}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Unique Products:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.uniqueParentProducts}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Selected:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.selectedProducts}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Editing Product:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.currentEditingProduct}>
                    {skuSidebarState.diagnostics.currentEditingProduct}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Editing SKU:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.currentEditingSku}>
                    {skuSidebarState.diagnostics.currentEditingSku}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Images:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.currentImageCount}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Last Action:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.lastSkuApiAction}>
                    {skuSidebarState.diagnostics.lastSkuApiAction}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Media Action:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.lastShopifyMediaAction}>
                    {skuSidebarState.diagnostics.lastShopifyMediaAction}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Status:</span>
                  <span className={`diagnostic-value status-${skuSidebarState.diagnostics.lastActionStatus}`}>
                    {skuSidebarState.diagnostics.lastActionStatus.toUpperCase()}
                    {skuSidebarState.diagnostics.lastRefreshTime ? ` (${skuSidebarState.diagnostics.lastRefreshTime})` : ""}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Last Error:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.lastError}>
                    {skuSidebarState.diagnostics.lastError}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Scopes:</span>
                  <span className="diagnostic-value text-truncate" title={skuSidebarState.diagnostics.requiredScopesStatus}>
                    {skuSidebarState.diagnostics.requiredScopesStatus}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Bulk Mode:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.bulkModeOpen ? "Open" : "Closed"}</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Running:</span>
                  <span className="diagnostic-value">{skuSidebarState.diagnostics.actionRunning ? "Yes" : "No"}</span>
                </div>
              </>
            ) : activeModule === "order-mapping" ? (
              <>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Module:</span>
                  <span className="diagnostic-value">{actualSalesSidebarState.diagnostics.activeModule}</span>
                </div>
<div className="diagnostic-item">
<span className="diagnostic-label">Total orders:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.loadedOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Orders with AWB:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.ordersWithAwb}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Shiprocket matched:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.matchedOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Delivered:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.deliveredOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">RTO delivered:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.rtoOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Pending tracking:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.pendingOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Historical courier:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.historicalOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Shiprocket unmatched:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.unmatchedShiprocketOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Active shipments:</span>
<span className="diagnostic-value">{actualSalesSidebarState.diagnostics.activeOrders}</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Current state:</span>
<span className="diagnostic-value text-truncate" title={actualSalesSidebarState.diagnostics.shiprocketStatus}>
{actualSalesSidebarState.diagnostics.shiprocketStatus}
</span>
</div>
<div className="diagnostic-item">
<span className="diagnostic-label">Last sync:</span>
<span className={`diagnostic-value status-${actualSalesSidebarState.diagnostics.lastActionStatus}`}>
{actualSalesSidebarState.diagnostics.lastActionStatus.toUpperCase()}
{actualSalesSidebarState.diagnostics.lastRefreshTime ? ` (${actualSalesSidebarState.diagnostics.lastRefreshTime})` : ""}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Last Error:</span>
                  <span className="diagnostic-value text-truncate" title={actualSalesSidebarState.diagnostics.lastError}>
                    {actualSalesSidebarState.diagnostics.lastError}
                  </span>
                </div>
              </>
            ) : (
              <>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Collections:</span>
                  <span className="diagnostic-value">{diagnostics.collectionsLoaded} loaded</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Products:</span>
                  <span className="diagnostic-value">{diagnostics.productsLoaded} loaded</span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Selected:</span>
                  <span className="diagnostic-value text-truncate" title={diagnostics.selectedCollection}>
                    {diagnostics.selectedCollection}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Last API:</span>
                  <span className="diagnostic-value text-truncate" title={diagnostics.lastApiCall}>
                    {diagnostics.lastApiCall}
                  </span>
                </div>
                <div className="diagnostic-item">
                  <span className="diagnostic-label">Status:</span>
                  <span className={`diagnostic-value status-${diagnostics.lastApiStatus}`}>
                    {diagnostics.lastApiStatus.toUpperCase()}
                    {diagnostics.lastApiTimestamp ? ` (${diagnostics.lastApiTimestamp})` : ""}
                  </span>
                </div>
              </>
            )}
          </div>
<div className="diagnostic-logs-container">
<div className="diagnostic-logs-header">
<span className="diagnostic-label">{activeModule === "order-mapping" ? "System diagnostics logs:" : "Network & Action Logs:"}</span>
<div className="diagnostic-logs-actions">
{activeModule === "order-mapping" ? (
<div className="diagnostic-tab-group" role="tablist" aria-label="Order Mapping logs">
<button type="button" className={`diagnostic-tab ${orderMappingLogTab === "activity" ? "active" : ""}`} onClick={() => setOrderMappingLogTab("activity")}>
Activity
</button>
<button type="button" className={`diagnostic-tab ${orderMappingLogTab === "network" ? "active" : ""}`} onClick={() => setOrderMappingLogTab("network")}>
Network
</button>
</div>
) : null}
<button type="button" className="diagnostic-clear-button" onClick={clearCurrentLogs}>
Clear Logs
</button>
</div>
</div>
<div className="diagnostic-logs">
{activeModule === "sorter" && logsError ? (
<div className="error-text">{logsError}</div>
) : null}
{visibleLogs.length === 0 ? (
<div className="diagnostic-log-empty">{activeModule === "order-mapping" ? "No diagnostics logged." : "No activity logged."}</div>
) : (
 visibleLogs.map((log, index) => (
                  typeof log === "string" ? (
                    <div key={index} className="diagnostic-log-line">{log}</div>
                  ) : (
                    <div
                      key={`${log.timestamp}-${index}`}
                      className="diagnostic-log-entry"
                      title={`${log.endpoint || ""} ${log.message || ""} ${log.error || ""}`.trim()}
                    >
                      <div className="diagnostic-log-top">
                        <span className="diagnostic-log-time">{log.timestamp}</span>
                        <span className={`diagnostic-badge status-${String(log.status || "idle").toLowerCase().replace(/\s+/g, "-")}`}>
                          {log.status}
                        </span>
                      </div>
                      <div className="diagnostic-log-line">[{log.module}] {log.actionType}</div>
                      <div className="diagnostic-log-line">{log.message}</div>
                    </div>
                  )
                ))
              )}
            </div>
          </div>
        </div>
      </aside>

      {activeModule === "sorter" ? (
      <ErrorBoundary key="sorter">
      <Sorter sidebarBridge={sorterSidebarBridge} />
      </ErrorBoundary>
      ) : activeModule === "order-mapping" ? (
      <ErrorBoundary key="order-mapping">
      <OrderMapping sidebarBridge={orderMappingSidebarBridge} />
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
  );
}

