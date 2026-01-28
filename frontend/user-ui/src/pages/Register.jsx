import { useState } from "react";
import { registerUser } from "../services/auth";
import { useNavigate } from "react-router-dom";

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    city: "",
    state: "",
  });
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    await registerUser(form);
    nav("/pending");
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>Membership Application</h2>

      <form onSubmit={submit}>
        <input
          placeholder="Full Name"
          required
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <br /><br />

        <input
          placeholder="Phone Number"
          required
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <br /><br />

        <input
          placeholder="City"
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <br /><br />

        <input
          placeholder="State"
          onChange={(e) => setForm({ ...form, state: e.target.value })}
        />
        <br /><br />

        <button disabled={loading}>
          {loading ? "Submitting..." : "Apply"}
        </button>
      </form>
    </div>
  );
}
