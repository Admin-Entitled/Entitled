import React, { useState, useEffect, useRef } from "react";
import { api as diagnosticsApi } from "./diagnosticsApi.js";

export default function NetworkActivity() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshIntervalRef = useRef(null);

  const fetchLogs = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      // Get network logs from canonical collections/logs/network endpoint
      const response = await diagnosticsApi.getNetworkLogs(100);
      setLogs(response.logs || []);
      setError("");
    } catch (err) {
      setError(err.message || "Failed to retrieve network logs");
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm("Are you sure you want to clear the network diagnostics log buffer?")) {
      return;
    }
    try {
      await diagnosticsApi.clearNetworkLogs();
      setLogs([]);
    } catch (err) {
      setError("Failed to clear network logs: " + err.message);
    }
  };

  useEffect(() => {
    fetchLogs(true);
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshIntervalRef.current = window.setInterval(() => {
        fetchLogs(false);
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

  const filteredLogs = logs.filter((log) => {
    if (filter === "ALL") return true;
    if (filter === "Errors") return log.status === "failed" || (log.statusCode && log.statusCode >= 400);
    if (filter === "Shopify") return log.provider === "shopify";
    if (filter === "Shiprocket") return log.provider === "shiprocket";
    if (filter === "Meta") return log.provider === "meta";
    if (filter === "Internal API") return log.provider !== "shopify" && log.provider !== "shiprocket" && log.provider !== "meta";
    return true;
  });

  return (
    <div className="dashboard-feature">
      <div className="feature-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <div>
          <h2 className="feature-title">Network Activity</h2>
          <p className="feature-subtitle">Real-time external API and provider transaction diagnostics</p>
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
          <button type="button" className="button compact secondary" onClick={() => fetchLogs(true)} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button type="button" className="button compact danger" onClick={handleClearLogs}>
            Clear Events
          </button>
        </div>
      </div>

      <div className="filter-tabs" style={{ display: "flex", gap: "0.25rem", marginBottom: "1rem" }}>
        {["ALL", "Shopify", "Shiprocket", "Meta", "Internal API", "Errors"].map((tab) => (
          <button
            key={tab}
            type="button"
            className={`filter-tab ${filter === tab ? "active" : ""}`}
            onClick={() => setFilter(tab)}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: "4px",
              border: "1px solid #ddd",
              backgroundColor: filter === tab ? "#0066cc" : "#fff",
              color: filter === tab ? "#fff" : "#333",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {error ? (
        <div className="error-banner" style={{ padding: "1rem", backgroundColor: "#ffebeb", color: "#cc0000", borderRadius: "4px", marginBottom: "1rem" }}>
          <h4 style={{ margin: 0 }}>DIAGNOSTICS UNAVAILABLE</h4>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.9rem" }}>{error}</p>
        </div>
      ) : null}

      <div className="table-container" style={{ overflowX: "auto" }}>
        <table className="data-table" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #eee", textAlign: "left" }}>
              <th style={{ padding: "0.75rem" }}>Timestamp</th>
              <th style={{ padding: "0.75rem" }}>Provider</th>
              <th style={{ padding: "0.75rem" }}>Method</th>
              <th style={{ padding: "0.75rem" }}>Endpoint / Operation</th>
              <th style={{ padding: "0.75rem" }}>Status</th>
              <th style={{ padding: "0.75rem" }}>Duration</th>
              <th style={{ padding: "0.75rem" }}>Error Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="7" style={{ textAlign: "center", padding: "2rem", color: "#888" }}>
                  {loading ? "Loading events..." : "No network events match the current filter."}
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isError = log.status === "failed" || (log.statusCode && log.statusCode >= 400);
                const timeStr = log.startedAt ? new Date(log.startedAt).toLocaleTimeString() : log.timestamp || "Unknown";
                return (
                  <tr key={log.id} style={{ borderBottom: "1px solid #eee", backgroundColor: isError ? "#fff0f0" : "transparent" }}>
                    <td style={{ padding: "0.75rem", fontSize: "0.85rem", whiteSpace: "nowrap" }}>{timeStr}</td>
                    <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>
                      <span
                        style={{
                          padding: "0.2rem 0.4rem",
                          borderRadius: "4px",
                          fontSize: "0.75rem",
                          fontWeight: "bold",
                          backgroundColor:
                            log.provider === "shopify"
                              ? "#eef6ff"
                              : log.provider === "shiprocket"
                              ? "#fff4e5"
                              : log.provider === "meta"
                              ? "#f0ebff"
                              : "#f5f5f5",
                          color:
                            log.provider === "shopify"
                              ? "#0066cc"
                              : log.provider === "shiprocket"
                              ? "#cc7a00"
                              : log.provider === "meta"
                              ? "#7a3ff2"
                              : "#555",
                        }}
                      >
                        {String(log.provider).toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem", fontSize: "0.85rem", fontWeight: "bold" }}>{log.method || "POST"}</td>
                    <td style={{ padding: "0.75rem", fontSize: "0.85rem" }} title={log.endpoint}>
                      <code style={{ fontSize: "0.8rem", color: "#444" }}>{log.operationName || log.endpoint}</code>
                    </td>
                    <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>
                      <span
                        className={`status-chip ${isError ? "status-failed" : "status-success"}`}
                        style={{
                          color: isError ? "#cc0000" : "#008800",
                          fontWeight: "bold",
                        }}
                      >
                        {log.statusCode || (log.status === "success" ? "200" : "ERR")}
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem", fontSize: "0.85rem" }}>{log.durationMs ? `${log.durationMs}ms` : "-"}</td>
                    <td
                      style={{
                        padding: "0.75rem",
                        fontSize: "0.85rem",
                        color: "#cc0000",
                        maxWidth: "300px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={log.errorMessage}
                    >
                      {log.errorMessage || "-"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
