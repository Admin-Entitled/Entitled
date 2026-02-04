import { useState } from "react";
import { register } from "../services/auth";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
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
    <div className="relative min-h-screen overflow-hidden bg-[#090909] text-zinc-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1050px 480px at 0% 0%, rgba(255,255,255,0.08), transparent 58%), radial-gradient(680px 420px at 100% 15%, rgba(255,255,255,0.06), transparent 56%), linear-gradient(180deg, #0d0d0d 0%, #050505 100%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.35'/%3E%3C/svg%3E\")",
        }}
      />

      <main className="relative mx-auto flex min-h-screen w-full max-w-[1100px] items-center px-5 py-12 lg:px-10">
        <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-16">
          <section className="flex flex-col justify-center">
            <div className="mb-8 inline-flex w-fit rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-300">
              Membership Application
            </div>
            <h1 className="text-5xl font-semibold tracking-tight text-white sm:text-6xl">Entitled</h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-zinc-300">
              Members-only access to premium menswear at unbeatable value.
            </p>
            <ul className="mt-10 space-y-4 text-sm text-zinc-200/95">
              <li className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-100" />
                Curated drops. Limited quantities.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-100" />
                Premium brands. Top-notch quality.
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-zinc-100" />
                Members-first support on WhatsApp.
              </li>
            </ul>
            <a
              href="https://wa.me/"
              target="_blank"
              rel="noreferrer"
              className="mt-10 inline-flex w-fit text-xs text-zinc-400 transition hover:text-zinc-200"
            >
              Need help? WhatsApp Support
            </a>
          </section>

          <section className="lg:pl-6">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-sm sm:p-8">
              <h2 className="text-2xl font-semibold text-white">Apply for Membership</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Your application is reviewed manually. Approved members get private access.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
                      Full Name
                    </label>
                    <input
                      className="h-12 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-200/70 focus:ring-2 focus:ring-zinc-200/20"
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
                      Phone
                    </label>
                    <input
                      className="h-12 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-200/70 focus:ring-2 focus:ring-zinc-200/20"
                      value={form.phone}
                      onChange={(e) => set("phone", e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
                      Email
                    </label>
                    <input
                      className="h-12 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-200/70 focus:ring-2 focus:ring-zinc-200/20"
                      value={form.email}
                      onChange={(e) => set("email", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
                      Pincode
                    </label>
                    <input
                      className="h-12 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-200/70 focus:ring-2 focus:ring-zinc-200/20"
                      value={form.pincode}
                      onChange={(e) => set("pincode", e.target.value)}
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
                      State
                    </label>
                    <input
                      className="h-12 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-200/70 focus:ring-2 focus:ring-zinc-200/20"
                      value={form.state}
                      onChange={(e) => set("state", e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
                      City
                    </label>
                    <input
                      className="h-12 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-200/70 focus:ring-2 focus:ring-zinc-200/20"
                      value={form.city}
                      onChange={(e) => set("city", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
                    Address
                  </label>
                  <textarea
                    className="min-h-24 w-full rounded-xl border border-white/15 bg-black/35 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-200/70 focus:ring-2 focus:ring-zinc-200/20"
                    rows={3}
                    value={form.address}
                    onChange={(e) => set("address", e.target.value)}
                  />
                </div>

                {err && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {err}
                  </div>
                )}
                {msg && (
                  <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                    {msg}
                  </div>
                )}

                <button
                  className="mt-2 h-12 w-full rounded-xl bg-white text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? "Submitting..." : "Submit Application"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-zinc-400">
                Already a member?{" "}
                <a href="/login" className="font-medium text-zinc-100 transition hover:text-zinc-300">
                  Sign in
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
