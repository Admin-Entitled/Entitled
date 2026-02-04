import { useState } from "react";
import { register } from "../services/auth";
import Wordmark from "../components/Wordmark";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    pincode: "",
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  function set(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setErr("");
    setLoading(true);
    try {
      const res = await register(form);
      setMsg(res?.data?.status ? "Application submitted for approval." : "Submitted.");
    } catch (e2) {
      setErr(e2?.response?.data?.error || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="shell">
        <div className="topbar">
          <div className="wordmarkSlot">
            <Wordmark />
            <span className="badge">Membership Application</span>
          </div>
          <a className="btn btnMetal" href="/login">
            Member Login
          </a>
        </div>

        <div style={{ padding: 20 }}>
          <div className="card">
            <h1 className="h1">Apply for Membership</h1>
            <p className="sub">
              Your application is reviewed manually. Once approved, you can login with only your phone number.
            </p>
            <div className="miniStrip">
              <div className="miniItem">
                <span className="miniLabel">Review time</span>
                <span className="miniValue">Typically within 24–72 hours</span>
              </div>
              <div className="miniItem">
                <span className="miniLabel">Data</span>
                <span className="miniValue">Minimal, verification only</span>
              </div>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid2">
                <div className="field">
                  <div className="label">Full Name</div>
                  <input className="control" value={form.name} onChange={(e)=>set("name", e.target.value)} />
                </div>
                <div className="field">
                  <div className="label">Phone</div>
                  <input className="control" value={form.phone} onChange={(e)=>set("phone", e.target.value)} inputMode="numeric" />
                </div>
                <div className="field">
                  <div className="label">Email</div>
                  <input className="control" value={form.email} onChange={(e)=>set("email", e.target.value)} />
                </div>
                <div className="field">
                  <div className="label">Pincode</div>
                  <input className="control" value={form.pincode} onChange={(e)=>set("pincode", e.target.value)} inputMode="numeric" />
                </div>
              </div>

              {/*
              Temporarily hidden fields:
              - State
              - City
              - Address
              */}

              {err && <div className="toast toastWarn">⚠️ {err}</div>}
              {msg && <div className="toast">✅ {msg}</div>}

              <div className="rowWrap" style={{ marginTop: 14 }}>
                <button className="btn btnPrimary" disabled={loading}>
                  {loading ? "Submitting…" : "Submit Application"}
                </button>
                <span className="small">
                  Authority-first UX • Minimal fields • High trust tone.
                </span>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
