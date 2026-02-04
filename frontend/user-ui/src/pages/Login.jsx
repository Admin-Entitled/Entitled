import { useState } from "react";
import { exchangeAccess, login } from "../services/auth";

function buildShopifyAccessUrl(shopUrlOrDomain, password) {
  if (!shopUrlOrDomain) return null;

  const raw = shopUrlOrDomain.trim();
  const hasProtocol = /^https?:\/\//i.test(raw);
  const base = hasProtocol ? raw : `https://${raw}`;
  const target = new URL(base);
  target.searchParams.set("password", password);
  return target.toString();
}

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
        const backendShopUrl = accessRes?.data?.shop_url;

        if (!password) {
          setErr("Access token invalid");
          return;
        }

        const configuredShopTarget =
          backendShopUrl ||
          import.meta.env.VITE_SHOPIFY_URL ||
          import.meta.env.VITE_SHOPIFY_DOMAIN;
        const redirectUrl = buildShopifyAccessUrl(configuredShopTarget, password);

        if (!redirectUrl) {
          setErr("Shopify URL is not configured. Please contact support.");
          return;
        }

        window.location.href = redirectUrl;
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
    <div className="relative min-h-screen overflow-hidden bg-[#090909] text-zinc-100">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 500px at 8% 2%, rgba(255,255,255,0.08), transparent 60%), radial-gradient(700px 440px at 100% 14%, rgba(255,255,255,0.06), transparent 58%), linear-gradient(180deg, #0d0d0d 0%, #050505 100%)",
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
              Member Login
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
              <h2 className="text-2xl font-semibold text-white">Enter the Club</h2>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Approved members can continue with only their phone number.
              </p>

              <form onSubmit={handleSubmit} className="mt-7 space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
                    Phone Number
                  </label>
                  <input
                    className="h-12 w-full rounded-xl border border-white/15 bg-black/35 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-200/70 focus:ring-2 focus:ring-zinc-200/20"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. 9000000000"
                    inputMode="numeric"
                  />
                </div>

                {err && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {err}
                  </div>
                )}
                {ok && (
                  <div className="rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                    {ok}
                  </div>
                )}

                <button
                  className="mt-2 h-12 w-full rounded-xl bg-white text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                >
                  {loading ? "Checking..." : "Continue"}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-zinc-400">
                New to Entitled?{" "}
                <a href="/register" className="font-medium text-zinc-100 transition hover:text-zinc-300">
                  Apply for membership
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
