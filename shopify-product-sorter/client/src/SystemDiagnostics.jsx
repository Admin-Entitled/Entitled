import React, { useState, useEffect, useRef } from "react";
import { api as diagnosticsApi } from "./diagnosticsApi.js";

export default function SystemDiagnostics() {
  const [data, setData] = useState(null);
  const [readiness, setReadiness] = useState(null);
  const [actionLogs, setActionLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshIntervalRef = useRef(null);

  const fetchDiagnostics = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      // Parallel fetches for diagnostic status and action logs
      const [diagRes, readinessRes, logsRes] = await Promise.all([
        diagnosticsApi.getDiagnostics(),
        diagnosticsApi.getReadiness(),
        diagnosticsApi.getActionLogs(20),
      ]);
      setData(diagRes);
      setReadiness(readinessRes);
      setActionLogs(logsRes.logs || []);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to retrieve diagnostics information");
      setData(null);
      setReadiness(null);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics(true);
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshIntervalRef.current = window.setInterval(() => {
        fetchDiagnostics(false);
      }, 5000);
    } else {
      if (autoRefreshIntervalRef.current) {
        window.clearInterval(autoRefreshIntervalRef.current);
        autoRefreshIntervalRef.current = null;
      }
    }
    return () => {
      if (autoRefreshIntervalRef.current) {
        window.clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [autoRefresh]);

  if (loading && !data) {
    return (
      <div className="dashboard-feature" style={{ padding: "2rem", textAlign: "center" }}>
        <div className="spinner" style={{ marginBottom: "1rem" }}></div>
        <p style={{ color: "#666" }}>LOADING DIAGNOSTICS...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="dashboard-feature" style={{ padding: "2rem" }}>
        <div className="error-banner" style={{ padding: "1.5rem", backgroundColor: "#ffebeb", color: "#cc0000", borderRadius: "8px", border: "1px solid #ffcccc" }}>
          <h3 style={{ margin: 0, fontWeight: "bold" }}>DIAGNOSTICS UNAVAILABLE</h3>
          <p style={{ margin: "0.5rem 0", fontSize: "0.95rem" }}>
            The system health endpoint could not be reached or returned an error status.
          </p>
          <code style={{ display: "block", marginTop: "1rem", fontSize: "0.85rem", color: "#660000" }}>{error}</code>
          <button type="button" className="button compact secondary" style={{ marginTop: "1.5rem" }} onClick={() => fetchDiagnostics(true)}>
            Retry Diagnostics Check
          </button>
        </div>
      </div>
    );
  }

  // Backend state check
  const dbStatus = readiness?.db === "connected" ? "HEALTHY" : "UNAVAILABLE";
  const shopifyStatus = data?.shopify?.status === "ok" ? "HEALTHY" : data?.shopify?.status === "provider_error" ? "DEGRADED" : "UNAVAILABLE";
  const shiprocketStatus = data?.shiprocket?.status === "configured" ? "HEALTHY" : "UNAVAILABLE";
  const metaAdsStatus = data?.metaAds?.configured
    ? (data?.metaAds?.connectionStatus === "CONNECTED" ? "HEALTHY" : data?.metaAds?.connectionStatus === "UNKNOWN" ? "UNKNOWN" : "DEGRADED")
    : "NOT CONFIGURED";
  const appStatus = data?.application?.status === "ok" ? "HEALTHY" : "DEGRADED";

  return (
    <div className="dashboard-feature" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div className="feature-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h2 className="feature-title">System Diagnostics</h2>
          <p className="feature-subtitle">Operational metrics, connectivity checks, and database snapshot statuses</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.85rem", cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (5s)
          </label>
          <button type="button" className="button compact secondary" onClick={() => fetchDiagnostics(true)} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Status"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
        {/* BACKEND STATUS */}
        <div style={{ border: "1px solid #eee", borderRadius: "6px", padding: "1rem", backgroundColor: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#666" }}>BACKEND</span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: "bold",
                padding: "0.2rem 0.5rem",
                borderRadius: "12px",
                backgroundColor: appStatus === "HEALTHY" ? "#e6fcf5" : "#fff0f6",
                color: appStatus === "HEALTHY" ? "#0ca678" : "#f03e3e",
              }}
            >
              {appStatus}
            </span>
          </div>
          <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#222" }}>Environment: test</div>
          <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.25rem" }}>Uptime: Active / Running</div>
        </div>

        {/* DATABASE STATUS */}
        <div style={{ border: "1px solid #eee", borderRadius: "6px", padding: "1rem", backgroundColor: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#666" }}>DATABASE</span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: "bold",
                padding: "0.2rem 0.5rem",
                borderRadius: "12px",
                backgroundColor: dbStatus === "HEALTHY" ? "#e6fcf5" : "#fff0f6",
                color: dbStatus === "HEALTHY" ? "#0ca678" : "#f03e3e",
              }}
            >
              {dbStatus}
            </span>
          </div>
          <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#222" }}>SQLite Storage</div>
          <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.25rem" }}>Status: Table schema validated</div>
        </div>

        {/* SHOPIFY STATUS */}
        <div style={{ border: "1px solid #eee", borderRadius: "6px", padding: "1rem", backgroundColor: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#666" }}>SHOPIFY</span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: "bold",
                padding: "0.2rem 0.5rem",
                borderRadius: "12px",
                backgroundColor: shopifyStatus === "HEALTHY" ? "#e6fcf5" : shopifyStatus === "DEGRADED" ? "#fff9db" : "#fff0f6",
                color: shopifyStatus === "HEALTHY" ? "#0ca678" : shopifyStatus === "DEGRADED" ? "#f08c00" : "#f03e3e",
              }}
            >
              {shopifyStatus}
            </span>
          </div>
          <div style={{ fontSize: "1rem", fontWeight: "bold", color: "#222" }}>
            Domain: {data?.shopify?.shopDomain || "None"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.25rem" }}>
            {data?.shopify?.collectionsCount ?? 0} Collections · {data?.shopify?.productsCount ?? 0} Products
          </div>
          {data?.shopify?.error ? (
            <div style={{ fontSize: "0.75rem", color: "#f03e3e", marginTop: "0.5rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={data.shopify.error}>
              Error: {data.shopify.error}
            </div>
          ) : null}
        </div>

        {/* META ADS STATUS */}
        <div style={{ border: "1px solid #eee", borderRadius: "6px", padding: "1rem", backgroundColor: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#666" }}>META ADS</span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: "bold",
                padding: "0.2rem 0.5rem",
                borderRadius: "12px",
                backgroundColor: metaAdsStatus === "HEALTHY" ? "#e6fcf5" : metaAdsStatus === "NOT CONFIGURED" ? "#f1f3f5" : metaAdsStatus === "UNKNOWN" ? "#fff9db" : "#fff0f6",
                color: metaAdsStatus === "HEALTHY" ? "#0ca678" : metaAdsStatus === "NOT CONFIGURED" ? "#868e96" : metaAdsStatus === "UNKNOWN" ? "#f08c00" : "#f03e3e",
              }}
            >
              {metaAdsStatus}
            </span>
          </div>
          <div style={{ fontSize: "1rem", fontWeight: "bold", color: "#222" }}>
            {data?.metaAds?.configured ? (data?.metaAds?.accountName || "Configured") : "Not Configured"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.25rem" }}>
            {data?.metaAds?.configured
              ? `${data?.metaAds?.currency || "—"} · ${data?.metaAds?.timezone || "—"}${data?.metaAds?.lastSuccessAt ? ` · Last success ${new Date(data.metaAds.lastSuccessAt).toLocaleString()}` : ""}`
              : `Missing: ${(data?.metaAds?.missingVariables || []).join(", ") || "META_ACCESS_TOKEN, META_AD_ACCOUNT_ID"}`}
          </div>
          {data?.metaAds?.connectionStatus && data?.metaAds?.connectionStatus !== "CONNECTED" && data?.metaAds?.configured ? (
            <div style={{ fontSize: "0.75rem", color: "#f08c00", marginTop: "0.5rem" }}>
              Connection: {data.metaAds.connectionStatus}
            </div>
          ) : null}
        </div>

        {/* SHIPROCKET STATUS */}
        <div style={{ border: "1px solid #eee", borderRadius: "6px", padding: "1rem", backgroundColor: "#fff" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <span style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#666" }}>SHIPROCKET</span>
            <span
              style={{
                fontSize: "0.75rem",
                fontWeight: "bold",
                padding: "0.2rem 0.5rem",
                borderRadius: "12px",
                backgroundColor: shiprocketStatus === "HEALTHY" ? "#e6fcf5" : "#fff0f6",
                color: shiprocketStatus === "HEALTHY" ? "#0ca678" : "#f03e3e",
              }}
            >
              {shiprocketStatus}
            </span>
          </div>
          <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "#222" }}>
            {data?.shiprocket?.configured ? "Configured" : "Not Configured"}
          </div>
          <div style={{ fontSize: "0.8rem", color: "#666", marginTop: "0.25rem" }}>
            Token Cached: {data?.shiprocket?.tokenPresent ? "Yes" : "No"}
          </div>
        </div>
      </div>

      {/* RECENT OPERATIONAL LOGS */}
      <div style={{ border: "1px solid #eee", borderRadius: "6px", backgroundColor: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #eee", fontWeight: "bold", backgroundColor: "#fafafa" }}>
          Recent Sorter Operational Actions
        </div>
        <div style={{ maxHeight: "300px", overflowY: "auto", padding: "0.5rem" }}>
          {actionLogs.length === 0 ? (
            <div style={{ padding: "1.5rem", textAlign: "center", color: "#888", fontSize: "0.9rem" }}>
              No operational actions logged in this session.
            </div>
          ) : (
            actionLogs.map((log) => {
              const isFailed = log.status === "failed";
              const timeStr = log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : log.timestamp || "Unknown";
              return (
                <div
                  key={log.id}
                  style={{
                    padding: "0.5rem",
                    borderBottom: "1px solid #f5f5f5",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.25rem",
                    backgroundColor: isFailed ? "#fff0f0" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: "bold", fontSize: "0.85rem" }}>
                      [{log.actionType || "Action"}] {log.actionLabel}
                    </span>
                    <span style={{ fontSize: "0.75rem", color: "#888" }}>{timeStr}</span>
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#555" }}>
                    {log.collectionTitle ? `Collection: ${log.collectionTitle}` : ""}
                    {log.processedCount ? ` · processed: ${log.processedCount}` : ""}
                    {log.movedCount ? ` · moved: ${log.movedCount}` : ""}
                    {log.durationMs ? ` · duration: ${log.durationMs}ms` : ""}
                  </div>
                  {log.errorMessage ? (
                    <div style={{ fontSize: "0.75rem", color: "#cc0000", fontWeight: "bold" }}>
                      Error: {log.errorMessage}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
