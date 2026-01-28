import { useState } from "react";
import axios from "axios";

const API = "https://api.entitledclub.com";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    try {
      await axios.post(
        `${API}/admin/auth/login`,
        { phone, password },
        { withCredentials: true }
      );

      window.location.href = "/";
    } catch {
      setError("Invalid phone or password");
    }
  }

  return (
    <div style={{ padding: 60, fontFamily: "sans-serif" }}>
      <h2>Admin Login</h2>

      <form onSubmit={handleSubmit}>
        <input
          placeholder="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <br /><br />

        <input
          type={show ? "text" : "password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="button"
          onClick={() => setShow(!show)}
          style={{ marginLeft: 8 }}
        >
          {show ? "Hide" : "Show"}
        </button>

        <br /><br />
        <button type="submit">Login</button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
