import { useState } from "react";
import { loginUser } from "../services/auth";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

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
    <div style={{ padding: 60, fontFamily: "sans-serif" }}>
      <h2>Member Login</h2>

      <form onSubmit={handleSubmit}>
        <input
          type={show ? "text" : "password"}
          placeholder="Phone number"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
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
