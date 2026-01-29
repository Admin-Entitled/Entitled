import { useState } from "react";
import { exchangeAccess, login } from "../services/auth";
import wordmark from "../assets/entitled-wordmark.jpg";

export default function Login() {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setOk("");
    setLoading(true);
    try {
      const res = await login({ phone: phone.trim() });
      const status = res?.data?.status;

      if (status === "approved") {
        if (!res?.data?.token) {
          setErr("Missing access token");
          return;
        }

        const token = res.data.token;
        localStorage.setItem("entitled_access_token", token);

        const accessRes = await exchangeAccess(token);
        const password = accessRes?.data?.password;

        if (!password) {
          setErr("Access token invalid");
          return;
        }

        const shopDomain =
          import.meta.env.VITE_SHOPIFY_DOMAIN || "www.entitledclub.com";
        window.location.href = `https://${shopDomain}?password=${encodeURIComponent(password)}`;
        setOk("Access granted.");
      } else if (status === "pending") {
        setErr("Membership is pending approval.");
      } else {
        setOk("Login checked.");
      }
      // your existing flow probably redirects to Shopify/access page afterward
    } catch (e2) {
      setErr(e2?.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="shell">
        <div className="topbar">
          <div className="wordmarkSlot">
            <img className="wordmarkImg" src={wordmark} alt="Entitled Club" />
            <span className="badge">Member Login</span>
          </div>
          <span className="kbd">Entitled Club</span>
        </div>

        <div style={{ padding: 20 }}>
          <div className="card">
            <h1 className="h1">Enter the Club</h1>
            <p className="sub">
              Members-only access. If you’re approved, your phone number is your key.
            </p>
            <div className="miniStrip">
              <div className="miniItem">
                <span className="miniLabel">Status</span>
                <span className="miniValue">Live membership check</span>
              </div>
              <div className="miniItem">
                <span className="miniLabel">Security</span>
                <span className="miniValue">One-time access token</span>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="field">
                <div className="label">Phone Number</div>
                <input
                  className="control"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9000000000"
                  inputMode="numeric"
                />
              </div>

              {err && <div className="toast toastWarn">⚠️ {err}</div>}
              {ok && <div className="toast">✅ {ok}</div>}

              <div className="rowWrap" style={{ marginTop: 14 }}>
                <button className="btn btnPrimary" disabled={loading}>
                  {loading ? "Checking…" : "Continue"}
                </button>
                <a className="btn btnMetal" href="/register">
                  Apply for Membership
                </a>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
