import { useState } from "react";
import { adminLogin } from "../services/adminAuth";
import wordmark from "../assets/entitled-wordmark.jpg";

export default function Login({ onSuccess }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await adminLogin(phone.trim(), password);
      onSuccess?.();
    } catch (e2) {
      setErr(e2?.response?.data?.error || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container loginPage">
      <div className="shell loginShell">
        <div className="topbar">
          <div className="wordmarkSlot">
            <img className="wordmarkImg" src={wordmark} alt="Entitled Club" />
            <span className="badge">Admin Access</span>
          </div>
        </div>

        <div className="loginBody">
          <div className="grid2 loginGrid">
            <div className="card loginCard">
              <h1 className="h1">Admin Login</h1>
              <p className="sub">
                Sign in to approve members, revoke access, and audit activity.
              </p>

              <form onSubmit={handleSubmit}>
                <div className="field">
                  <div className="label">Phone</div>
                  <input
                    className="control"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="numeric"
                    autoComplete="off"
                  />
                </div>

                <div className="field">
                  <div className="label">Password</div>
                  <div className="row">
                    <input
                      className="control"
                      style={{ flex: 1 }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      type={showPw ? "text" : "password"}
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      className="btn btnMetal"
                      onClick={() => setShowPw((s) => !s)}
                      title="Show/Hide"
                    >
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {err && <div className="toast">⚠️ {err}</div>}

                <div className="rowWrap" style={{ marginTop: 14 }}>
                  <button className="btn btnPrimary" disabled={loading}>
                    {loading ? "Signing in..." : "Sign In"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
