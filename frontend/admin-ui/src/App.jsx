import { useEffect, useState } from "react";
import {
  fetchMembers,
  approveMember,
  approveAll,
  removeMember,
  removeAll,
  removeByPhones,
  fetchAuditLogs,
} from "./services/members";

const styles = {
  approve: {
    background: "#1b5e20",
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    cursor: "pointer",
  },
  danger: {
    background: "#b71c1c",
    color: "#fff",
    border: "none",
    padding: "6px 10px",
    cursor: "pointer",
    marginLeft: 6,
  },
  badgePending: { color: "#e65100", fontWeight: "bold" },
  badgeApproved: { color: "#1b5e20", fontWeight: "bold" },
  tab: {
    padding: "8px 14px",
    cursor: "pointer",
    border: "1px solid #ccc",
    marginRight: 6,
  },
  tabActive: {
    background: "#000",
    color: "#fff",
  },
};

function App() {
  const [view, setView] = useState("members");

  const [members, setMembers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bulkPhones, setBulkPhones] = useState("");

  const [filters, setFilters] = useState({
    status: "pending",
    state: "",
    city: "",
  });

  async function loadMembers() {
    setLoading(true);
    const data = await fetchMembers(filters);
    setMembers(data);
    setLoading(false);
  }

  async function loadAuditLogs() {
    setLoading(true);
    const data = await fetchAuditLogs();
    setAuditLogs(data);
    setLoading(false);
  }

  useEffect(() => {
    view === "members" ? loadMembers() : loadAuditLogs();
    // eslint-disable-next-line
  }, [view]);

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Entitled Club — Admin Panel</h1>

      {/* TABS */}
      <div style={{ marginBottom: 20 }}>
        <button
          style={{
            ...styles.tab,
            ...(view === "members" ? styles.tabActive : {}),
          }}
          onClick={() => setView("members")}
        >
          Members
        </button>

        <button
          style={{
            ...styles.tab,
            ...(view === "audit" ? styles.tabActive : {}),
          }}
          onClick={() => setView("audit")}
        >
          Audit Logs
        </button>
      </div>

      {/* MEMBERS VIEW */}
      {view === "members" && (
        <>
          <div style={{ marginBottom: 10 }}>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters({ ...filters, status: e.target.value })
              }
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>

            <input
              placeholder="State"
              value={filters.state}
              onChange={(e) =>
                setFilters({ ...filters, state: e.target.value })
              }
              style={{ marginLeft: 8 }}
            />

            <input
              placeholder="City"
              value={filters.city}
              onChange={(e) =>
                setFilters({ ...filters, city: e.target.value })
              }
              style={{ marginLeft: 8 }}
            />

            <button style={styles.approve} onClick={loadMembers}>
              Apply
            </button>

            <button style={styles.approve} onClick={() => approveAll(filters)}>
              Approve All
            </button>

            <button style={styles.danger} onClick={() => removeAll(filters)}>
              Remove All
            </button>
          </div>

          <table border="1" cellPadding="8">
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>City</th>
                <th>State</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>{m.phone}</td>
                  <td>{m.city}</td>
                  <td>{m.state}</td>
                  <td>
                    {m.status === "pending" ? (
                      <span style={styles.badgePending}>PENDING</span>
                    ) : (
                      <span style={styles.badgeApproved}>APPROVED</span>
                    )}
                  </td>
                  <td>
                    {m.status === "pending" && (
                      <button
                        style={styles.approve}
                        onClick={() => approveMember(m.id)}
                      >
                        Approve
                      </button>
                    )}
                    <button
                      style={styles.danger}
                      onClick={() => removeMember(m.id)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* AUDIT VIEW */}
      {view === "audit" && (
        <>
          {loading && <p>Loading audit logs...</p>}
          <table border="1" cellPadding="8">
            <thead>
              <tr>
                <th>Time</th>
                <th>Admin Phone</th>
                <th>Action</th>
                <th>Payload</th>
              </tr>
            </thead>
            <tbody>
              {auditLogs.map((log) => (
                <tr key={log.id}>
                  <td>{new Date(log.created_at).toLocaleString()}</td>
                  <td>{log.admin_phone}</td>
                  <td>{log.action}</td>
                  <td>
                    <pre style={{ margin: 0 }}>
                      {JSON.stringify(log.payload, null, 2)}
                    </pre>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default App;
