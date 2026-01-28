import { useState } from "react";
import { loginUser } from "../services/auth";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const res = await loginUser(phone);
      if (res.access_url) {
        window.location.href = res.access_url;
      } else {
        setError("Access not approved yet");
      }
    } catch {
      setError("Invalid or unapproved user");
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>Member Login</h2>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <br /><br />
        <button type="submit">Login</button>
      </form>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </div>
  );
}
