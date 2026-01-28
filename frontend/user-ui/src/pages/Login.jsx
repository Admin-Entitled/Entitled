import { useState } from "react";
import { loginUser } from "../services/auth";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");

  async function submit(e) {
    e.preventDefault();
    const res = await loginUser(phone);

    if (res.status === "pending") {
      setMsg("Your membership is still under review.");
      return;
    }

    if (res.status === "approved") {
      // store token for next step (Shopify bridge)
      localStorage.setItem("entitled_access_token", res.token);
      setMsg("Approved. Redirecting…");

      // Phase 5 will replace this with Shopify redirect
      window.location.href =
        "https://entitledclub.com/access?token=" + res.token;
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>Member Login</h2>

      <form onSubmit={submit}>
        <input
          placeholder="Phone Number"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <br />
        <br />

        <button>Login</button>
      </form>

      {msg && <p>{msg}</p>}
    </div>
  );
}
