import { useEffect, useState } from "react";
import {
  fetchMembers,
  approveMember,
  approveAll,
  removeMember,
  removeAll,
  removeByPhones,
} from "./services/members";

function App() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [bulkPhones, setBulkPhones] = useState("");

  const [filters, setFilters] = useState({
    status: "pending",
    state: "",
    city: "",
  });

  async function loadMembers() {
    setLoading(true);
    try {
      const data = await fetchMembers(filters);
      setMembers(data);
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id) {
    await approveMember(id);
    loadMembers();
  }

  async function handleApproveAll() {
    if (!confirm("Approve ALL matching filters?")) return;
    await approveAll(filters);
    loadMembers();
  }

  async function handleRemove(id) {
    if (!confirm("Remove this user permanently?")) return;
    await removeMember(id);
    loadMembers();
  }

  async function handleRemoveAll() {
    if (!confirm("REMOVE ALL users matching filters? This is irreversible.")) return;
    await removeAll(filters);
    loadMembers();
  }

  async function handleRemoveByPhones() {
    const phones = bulkPhones
      .split(/[\s,]+/)
      .map(p => p.trim())
      .filter(Boolean);

    if (phones.length === 0) return alert("Enter phone numbers");
    if (!confirm(`Remove ${phones.length} users by phone?`)) return;

    await removeByPhones(phones);
    setBulkPhones("");
    loadMembers();
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Entitled Club — Admin Panel</h1>

      {/* FILTERS */}
      <div style={{ marginBottom: 12 }}>
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
        >
          <option value="">All</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
        </select>

        <input
          placeholder="State (MH)"
          value={filters.state}
          onChange={(e) => setFilters({ ...filters, state: e.target.value })}
          style={{ marginLeft: 8 }}
        />

        <input
          placeholder="City (Mumbai)"
          value={filters.city}
          onChange={(e) => setFilters({ ...filters, city: e.target.value })}
          style={{ marginLeft: 8 }}
        />

        <button onClick={loadMembers} style={{ marginLeft: 8 }}>
          Apply
        </button>

        <button onClick={handleApproveAll} style={{ marginLeft: 8 }}>
          Approve All
        </button>

        <button onClick={handleRemoveAll} style={{ marginLeft: 8 }}>
          Remove All
        </button>
      </div>

      {/* BULK PHONE REMOVE */}
      <div style={{ marginBottom: 12 }}>
        <textarea
          placeholder="Paste phone numbers (comma / space separated)"
          value={bulkPhones}
          onChange={(e) => setBulkPhones(e.target.value)}
          rows={3}
          style={{ width: 400 }}
        />
        <br />
        <button onClick={handleRemoveByPhones} style={{ marginTop: 6 }}>
          Remove by Phone Numbers
        </button>
      </div>

      {loading && <p>Loading...</p>}

      {/* TABLE */}
      <table border="1" cellPadding="8" cellSpacing="0">
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
              <td>{m.status}</td>
              <td>
                {m.status === "pending" && (
                  <button onClick={() => handleApprove(m.id)}>Approve</button>
                )}
                <button
                  onClick={() => handleRemove(m.id)}
                  style={{ marginLeft: 6 }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {members.length === 0 && (
            <tr>
              <td colSpan="6">No users found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default App;
