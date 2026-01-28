import { useState } from "react";
import { adminLogin } from "../services/adminAuth";

export default function Login({ onSuccess }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await adminLogin(phone, password);
      onSuccess();
    } catch {
      setError("Invalid credentials");
    }
  }

  return (
    <div style={{ padding: 40, maxWidth: 400 }}>
      <h2>Admin Login</h2>

      <form onSubmit={handleSubmit}>
        <input
          placeholder="Phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
        />
        <br /><br />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <br /><br />
        <button type="submit">Login</button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
