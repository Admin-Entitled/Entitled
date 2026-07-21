import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { register } from "../services/auth";
import Wordmark from "../components/Wordmark";
import WhatsAppSupportIcon from "../assets/whatsapp-support-icon.png";
import { coercePhoneInput, normalizePhoneToIndian10 } from "../utils/phone";

export default function Register() {
  const location = useLocation();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    pincode: "",
  });

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    const prefillPhone = location?.state?.phone;
    if (typeof prefillPhone === "string" && prefillPhone) {
      setForm((p) => ({ ...p, phone: coercePhoneInput(prefillPhone) }));
    }
  }, [location?.state?.phone]);

  function set(k, v) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg("");
    setErr("");
    setLoading(true);
    try {
      const normalizedPhone = normalizePhoneToIndian10(form.phone);
      if (!normalizedPhone) {
        setErr("Enter a valid 10-digit phone number.");
        setLoading(false);
        return;
      }

      const payload = {
        ...form,
        phone: normalizedPhone,
      };
      const res = await register(payload);
      setMsg(res?.data?.status ? "Application submitted for approval." : "Submitted.");
    } catch (e2) {
      setErr(e2?.response?.data?.error || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-root">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_18%_12%,rgba(91,10,25,0.22),transparent_58%),radial-gradient(900px_circle_at_78%_22%,rgba(91,10,25,0.16),transparent_60%),linear-gradient(180deg,rgba(11,11,12,0.95),rgba(11,11,12,1))]" />
        <div className="absolute -left-80 -top-72 h-[980px] w-[980px] rounded-full bg-oxblood/20 blur-[240px]" />
        <div className="absolute -right-[28rem] -bottom-[26rem] h-[1100px] w-[1100px] rounded-full bg-oxblood/16 blur-[260px]" />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_18%_12%,rgba(91,10,25,0.20),transparent_56%),radial-gradient(900px_circle_at_78%_22%,rgba(91,10,25,0.12),transparent_58%)]" />
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(242,236,226,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(242,236,226,0.10)_1px,transparent_1px)] [background-size:3px_3px]" />

      <div className="page-wrap">
        <header className="page-header bg-transparent backdrop-blur-0">
          <div className="flex items-center gap-3">
            <Wordmark className="h-4 w-auto md:h-[18px]" />
            <span className="badge">
              Membership Application
            </span>
          </div>
          <Link className="link-inline" to="/login">
            Member Login
          </Link>
        </header>

        <main className="my-auto grid gap-7 py-8 md:grid-cols-2 md:items-center md:gap-10 md:py-12">
          <section className="panel p-8 md:p-10">
            <p className="eyebrow mb-3">Private Membership</p>
            <h1 className="title-hero font-display">Entitled</h1>
            <p className="lead mt-4 max-w-xl">
              Members-only access to premium menswear at unbeatable value.
            </p>
            <ul className="mt-4 max-w-xl list-disc space-y-2 pl-5 text-sm leading-snug text-white/95">
              <li>Curated drops. Limited quantities.</li>
              <li>Premium brands. Top-notch quality.</li>
              <li>Members-first support on WhatsApp.</li>
            </ul>
            <div className="mt-10 inline-flex items-center justify-center mx-auto gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/85">
              <img
                src={WhatsAppSupportIcon}
                alt="WhatsApp"
                className="h-5 w-5"
              />
              <span>
                Need help? <span className="text-white/85">WhatsApp Support</span>
              </span>
            </div>
          </section>

          <section className="panel-strong">
            <p className="eyebrow">Membership Application</p>
            <h2 className="title-section font-display mt-3">Apply for Membership</h2>
            <p className="lead mt-2">
              We review each application manually. Approved members can log in using only phone number.
            </p>

            <form className="mt-6" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="field-label">Full Name</label>
                  <input
                    className="field-input"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    type="text"
                    autoComplete="name"
                  />
                </div>
                <div>
                  <label className="field-label">Phone</label>
                  <input
                    className="field-input"
                    value={form.phone}
                    onChange={(e) => set("phone", coercePhoneInput(e.target.value))}
                    type="tel"
                    autoComplete="tel"
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="8770199124"
                  />
                </div>
                <div>
                  <label className="field-label">Email</label>
                  <input
                    className="field-input"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    type="email"
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label className="field-label">Pincode</label>
                  <input
                    className="field-input"
                    value={form.pincode}
                    onChange={(e) => set("pincode", e.target.value)}
                    type="text"
                    autoComplete="postal-code"
                    inputMode="numeric"
                  />
                </div>
              </div>

              {err && (
                <div className="status-err mt-4 px-3 py-2">
                  {err}
                </div>
              )}
              {msg && (
                <div className="status-ok mt-4 px-3 py-2">
                  {msg}
                </div>
              )}

              <div className="mt-6">
                <button
                  className="btn-primary"
                  disabled={loading}
                >
                  {loading ? "Submitting…" : "Submit Application"}
                </button>
              </div>
              <div className="mt-6 inline-flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-white/80">
                <img
                  src={WhatsAppSupportIcon}
                  alt="WhatsApp"
                  className="h-5 w-5"
                />
                <span>
                  Need help? <span className="text-white/90">WhatsApp Support</span>
                </span>
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
