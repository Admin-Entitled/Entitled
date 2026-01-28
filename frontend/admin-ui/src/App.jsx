import { useEffect, useState } from "react";
import {
  fetchMembers,
  approveMember,
  approveAll,
} from "./services/members";

function App() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(false);

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
    } catch (err) {
      console.error("API ERROR:", err);
      if (err.response) {
        alert(`API error ${err.response.status}`);
      } else {
        alert("Network error");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id) {
    await approveMember(id);
    loadMembers();
  }

  async function handleApproveAll() {
    if (!window.confirm("Approve ALL members matching current filters?")) return;
    await approveAll(filters);
    loadMembers();
  }

  useEffect(() => {
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Entitled Club — Admin Panel</h1>

      {/* FILTERS */}
      <div style={{ marginBottom: 12 }}>
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
          placeholder="State (e.g. MH)"
          value={filters.state}
          onChange={(e) =>
            setFilters({ ...filters, state: e.target.value })
          }
          style={{ marginLeft: 8 }}
        />

        <input
          placeholder="City (e.g. Mumbai)"
          value={filters.city}
          onChange={(e) =>
            setFilters({ ...filters, city: e.target.value })
          }
          style={{ marginLeft: 8 }}
        />

        <button
          onClick={loadMembers}
          style={{ marginLeft: 8 }}
        >
          Apply Filters
        </button>

        <button
          onClick={handleApproveAll}
          style={{ marginLeft: 8 }}
        >
          Approve All (Filtered)
        </button>
      </div>

      {/* TABLE */}
      {loading && <p>Loading...</p>}

      <table border="1" cellPadding="8" cellSpacing="0">
        <thead>
          <tr>
            <th>Name</th>
            <th>Phone</th>
            <th>City</th>
            <th>State</th>
            <th>Status</th>
            <th>Action</th>
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
                  <button onClick={() => handleApprove(m.id)}>
                    Approve
                  </button>
                )}
              </td>
            </tr>
          ))}
          {members.length === 0 && (
            <tr>
              <td colSpan="6">No members found</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default App;
