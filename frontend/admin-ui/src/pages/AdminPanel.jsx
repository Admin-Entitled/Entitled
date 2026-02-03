import { useEffect, useMemo, useState } from "react";
import Wordmark from "../components/Wordmark";
import {
  fetchMembers,
  approveMember,
  approveAll,
  removeMember,
  removeAll,
  removeByPhones,
  fetchAuditLogs,
} from "../services/members";
import {
  adminMe,
  changeAdminPassword,
  createAdmin,
} from "../services/adminAuth";

export default function AdminPanel() {
  const [view, setView] = useState("members");
  const [members, setMembers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adminPhone, setAdminPhone] = useState("");
  const [adminNotice, setAdminNotice] = useState("");

  const [bulkPhones, setBulkPhones] = useState("");
  const phonesParsed = useMemo(
    () =>
      bulkPhones
        .split(/[\s,]+/)
        .map((p) => p.trim())
        .filter(Boolean),
    [bulkPhones]
  );

  const [filters, setFilters] = useState({
    status: "pending",
    state: "",
    city: "",
  });

  const [addAdminPhone, setAddAdminPhone] = useState("");
  const [addAdminPassword, setAddAdminPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function loadMembers() {
    setLoading(true);
    try {
      const data = await fetchMembers(filters);
      setMembers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  async function loadAudit() {
    setLoading(true);
    try {
      const data = await fetchAuditLogs();
      setAuditLogs(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  async function loadAdmin() {
    try {
      const data = await adminMe();
      setAdminPhone(data?.admin_phone || "");
    } catch {
      setAdminPhone("");
    }
  }

  useEffect(() => {
    if (view === "members") {
      loadMembers();
    } else if (view === "audit") {
      loadAudit();
    }
    // eslint-disable-next-line
  }, [view]);

  useEffect(() => {
    loadAdmin();
  }, []);

  async function onApproveOne(id) {
    await approveMember(id);
    await loadMembers();
  }

  async function onApproveAll() {
    if (!confirm("Approve ALL members matching filters?")) return;
    await approveAll(filters);
    await loadMembers();
  }

  async function onRemoveOne(id) {
    if (!confirm("Remove this user permanently?")) return;
    await removeMember(id);
    await loadMembers();
  }

  async function onRemoveAll() {
    if (!confirm("REMOVE ALL users matching filters? Irreversible.")) return;
    await removeAll(filters);
    await loadMembers();
  }

  async function onRemoveByPhones() {
    if (phonesParsed.length === 0) return alert("Enter phone numbers");
    if (!confirm(`Remove ${phonesParsed.length} users by phone?`)) return;
    await removeByPhones(phonesParsed);
    setBulkPhones("");
    await loadMembers();
  }

  async function onCreateAdmin(e) {
    e.preventDefault();
    setAdminNotice("");
    if (!addAdminPhone || !addAdminPassword) {
      return alert("Phone and password required");
    }
    try {
      await createAdmin(addAdminPhone, addAdminPassword);
      setAdminNotice(`Admin created for ${addAdminPhone}`);
      setAddAdminPhone("");
      setAddAdminPassword("");
    } catch (err) {
      alert(err?.response?.data?.error || "Failed to create admin");
    }
  }

  async function onChangePassword(e) {
    e.preventDefault();
    setAdminNotice("");
    if (!currentPassword || !newPassword) {
      return alert("Current and new password required");
    }
    try {
      await changeAdminPassword(currentPassword, newPassword);
      setAdminNotice("Password updated");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      alert(err?.response?.data?.error || "Failed to update password");
    }
  }

  return (
    <div className="container">
      <div className="shell">
        <div className="topbar">
          <div className="wordmarkSlot">
            <Wordmark />
            <span className="badge">Admin Panel</span>
          </div>

          <div className="rowWrap">
            <button
              className={`btn ${view === "members" ? "btnPrimary" : ""}`}
              onClick={() => setView("members")}
            >
              Members
            </button>
            <button
              className={`btn ${view === "audit" ? "btnPrimary" : ""}`}
              onClick={() => setView("audit")}
            >
              Audit Logs
            </button>
            <button
              className={`btn ${view === "admins" ? "btnPrimary" : ""}`}
              onClick={() => setView("admins")}
            >
              Admins
            </button>
          </div>
        </div>

        <div style={{ padding: 20 }}>
          {view === "members" && (
            <>
              <div className="card">
                <div className="rowWrap" style={{ justifyContent: "space-between" }}>
                  <div>
                    <h1 className="h1">Members</h1>
                    <p className="sub">
                      Filter applicants. Approve, remove, bulk-remove by phones.
                    </p>
                  </div>
                  <span className="badge">
                    {loading ? "Loading…" : `${members.length} shown`}
                  </span>
                </div>

                <div className="hr" />

                {/* Filters */}
                <div className="rowWrap">
                  <select
                    className="control"
                    style={{ width: 180 }}
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
                    className="control"
                    style={{ width: 180 }}
                    placeholder="State (e.g. MH)"
                    value={filters.state}
                    onChange={(e) =>
                      setFilters({ ...filters, state: e.target.value })
                    }
                  />

                  <input
                    className="control"
                    style={{ width: 220 }}
                    placeholder="City (e.g. Mumbai)"
                    value={filters.city}
                    onChange={(e) =>
                      setFilters({ ...filters, city: e.target.value })
                    }
                  />

                  <button className="btn btnMetal" onClick={loadMembers}>
                    Apply
                  </button>

                  <button className="btn btnPrimary" onClick={onApproveAll}>
                    Approve All
                  </button>

                  <button className="btn btnDanger" onClick={onRemoveAll}>
                    Remove All
                  </button>
                </div>

                {/* Bulk remove by phones */}
                <div className="hr" />

                {adminNotice && (
                  <div className="small" style={{ marginBottom: 12 }}>
                    {adminNotice}
                  </div>
                )}

                <div className="grid2">
                  <div>
                    <div className="label">Bulk remove by phone</div>
                    <textarea
                      className="control"
                      rows={3}
                      placeholder="Paste phones (comma/space/newline separated)"
                      value={bulkPhones}
                      onChange={(e) => setBulkPhones(e.target.value)}
                    />
                    <div className="rowWrap" style={{ marginTop: 10 }}>
                      <button className="btn btnDanger" onClick={onRemoveByPhones}>
                        Remove by Phones
                      </button>
                      <span className="small">
                        Parsed: <b>{phonesParsed.length}</b>
                      </span>
                    </div>
                  </div>

                  <div className="card" style={{ background: "rgba(0,0,0,.12)" }}>
                    <div className="label">Operator notes</div>
                    <div className="small">
                      • Use filters for state/city batch actions.
                      <br />
                      • Approve generates access session tokens.
                      <br />
                      • Removals delete member + access sessions.
                    </div>
                  </div>
                </div>
              </div>

              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>City</th>
                      <th>State</th>
                      <th>Status</th>
                      <th style={{ width: 220 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id}>
                        <td>{m.name || "-"}</td>
                        <td>{m.phone}</td>
                        <td>{m.city || "-"}</td>
                        <td>{m.state || "-"}</td>
                        <td>
                          {m.status === "pending" ? (
                            <span className="pill pillPending">⏳ PENDING</span>
                          ) : (
                            <span className="pill pillApproved">✅ APPROVED</span>
                          )}
                        </td>
                        <td>
                          <div className="rowWrap">
                            {m.status === "pending" && (
                              <button
                                className="btn btnPrimary"
                                onClick={() => onApproveOne(m.id)}
                              >
                                Approve
                              </button>
                            )}
                            <button
                              className="btn btnDanger"
                              onClick={() => onRemoveOne(m.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {members.length === 0 && (
                      <tr>
                        <td colSpan="6" className="small">
                          No users found for these filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {view === "audit" && (
            <>
              <div className="card">
                <div className="rowWrap" style={{ justifyContent: "space-between" }}>
                  <div>
                    <h1 className="h1">Audit Logs</h1>
                    <p className="sub">
                      Last actions performed by admins (approval/removal/bulk ops).
                    </p>
                  </div>
                  <button className="btn btnMetal" onClick={loadAudit}>
                    Refresh
                  </button>
                </div>
              </div>

              <div className="tableWrap">
                <table>
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
                          <pre style={{ margin: 0, color: "rgba(242,236,226,.85)" }}>
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan="4" className="small">
                          No audit logs yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {view === "admins" && (
            <>
              <div className="card">
                <div className="rowWrap" style={{ justifyContent: "space-between" }}>
                  <div>
                    <h1 className="h1">Admins</h1>
                    <p className="sub">
                      Add new admins and update your password.
                    </p>
                  </div>
                  {adminPhone && (
                    <span className="badge">Signed in: {adminPhone}</span>
                  )}
                </div>

                <div className="hr" />

                <div className="grid2">
                  <form onSubmit={onCreateAdmin}>
                    <div className="label">Create admin</div>
                    <input
                      className="control"
                      placeholder="Phone"
                      value={addAdminPhone}
                      onChange={(e) => setAddAdminPhone(e.target.value)}
                    />
                    <input
                      className="control"
                      type="password"
                      placeholder="Password"
                      value={addAdminPassword}
                      onChange={(e) => setAddAdminPassword(e.target.value)}
                    />
                    <div className="rowWrap" style={{ marginTop: 10 }}>
                      <button className="btn btnPrimary" type="submit">
                        Add Admin
                      </button>
                    </div>
                  </form>

                  <form onSubmit={onChangePassword}>
                    <div className="label">Change password</div>
                    <input
                      className="control"
                      type="password"
                      placeholder="Current password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                    />
                    <input
                      className="control"
                      type="password"
                      placeholder="New password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                    />
                    <div className="rowWrap" style={{ marginTop: 10 }}>
                      <button className="btn btnMetal" type="submit">
                        Update Password
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
