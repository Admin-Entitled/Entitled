import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Wordmark from "../components/Wordmark";
import WhatsAppSupportIcon from "../assets/whatsapp-support-icon.png";
import { exchangeAccess, login } from "../services/auth";

function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.slice(2);
  }
  return digits;
}

function buildShopifyPasswordEndpoint(shopUrlOrDomain) {
  if (!shopUrlOrDomain) return null;
  const raw = shopUrlOrDomain.trim();
  const hasProtocol = /^https?:\/\//i.test(raw);
  const base = hasProtocol ? raw : `https://${raw}`;
  const target = new URL(base);
  target.pathname = "/password";
  target.search = "";
  target.hash = "";
  return target.toString();
}

function submitShopifyPassword(shopUrlOrDomain, password) {
  const endpoint = buildShopifyPasswordEndpoint(shopUrlOrDomain);
  if (!endpoint || !password) return false;
  const returnTo = new URL("/", endpoint).pathname;

  const form = document.createElement("form");
  form.method = "POST";
  form.action = endpoint;
  form.style.display = "none";

  const formTypeField = document.createElement("input");
  formTypeField.type = "hidden";
  formTypeField.name = "form_type";
  formTypeField.value = "storefront_password";
  form.appendChild(formTypeField);

  const utf8Field = document.createElement("input");
  utf8Field.type = "hidden";
  utf8Field.name = "utf8";
  utf8Field.value = "✓";
  form.appendChild(utf8Field);

  const passwordField = document.createElement("input");
  passwordField.type = "hidden";
  passwordField.name = "password";
  passwordField.value = password;
  form.appendChild(passwordField);

  const returnToField = document.createElement("input");
  returnToField.type = "hidden";
  returnToField.name = "return_to";
  returnToField.value = returnTo;
  form.appendChild(returnToField);

  document.body.appendChild(form);
  form.submit();
  return true;
}

export default function Landing() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const normalizedPhone = normalizePhone(phone);
  const isValidPhone = normalizedPhone.length === 10;

  async function tryLoginCandidates(normalized) {
    const result = await login({ phone: normalized });
    const statusRaw = result?.data?.status;
    const status = typeof statusRaw === "string" ? statusRaw.toLowerCase() : "";

    if (status === "approved" && result?.data?.token) {
      return { kind: "approved", token: result.data.token };
    }
    if (status === "pending") {
      return { kind: "pending" };
    }
    return { kind: "not_found" };
  }

  async function redirectToStoreWithToken(token) {
    localStorage.setItem("entitled_access_token", token);
    const accessRes = await exchangeAccess(token);
    const password = accessRes?.data?.password;
    const backendShopUrl = accessRes?.data?.shop_url;
    if (!submitShopifyPassword(backendShopUrl, password)) {
      throw new Error("Shopify URL is not configured.");
    }
  }

  async function handleContinue(e) {
    e.preventDefault();
    setErr("");
    setOk("");

    if (!isValidPhone) {
      setErr("Enter a valid 10-digit phone number.");
      return;
    }

    setLoading(true);
    try {
      const loginProbe = await tryLoginCandidates(normalizedPhone);

      if (loginProbe.kind === "approved") {
        setOk("Login successful. Redirecting you to the store...");
        await redirectToStoreWithToken(loginProbe.token);
        return;
      }

      if (loginProbe.kind === "not_found") {
        setErr("You are not registered yet. Redirecting you to registration...");
      } else {
        setErr("Your membership is pending approval. Redirecting you to registration...");
      }
      nav("/register", { state: { phone: normalizedPhone } });
    } catch (e2) {
      if (e2?.code === "AUTH_ENDPOINT_NOT_FOUND") {
        setErr("Login service is unavailable right now. Please contact support.");
        return;
      }
      setErr(e2?.message || e2?.response?.data?.error || "Could not check membership status. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-root bg-base">
      {/* Background: richer, controlled */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_18%_12%,rgba(91,10,25,0.22),transparent_58%),radial-gradient(900px_circle_at_78%_22%,rgba(91,10,25,0.16),transparent_60%),linear-gradient(180deg,rgba(11,11,12,0.95),rgba(11,11,12,1))]" />
        <div className="absolute -left-80 -top-72 h-[980px] w-[980px] rounded-full bg-oxblood/20 blur-[240px]" />
        <div className="absolute -right-[28rem] -bottom-[26rem] h-[1100px] w-[1100px] rounded-full bg-oxblood/16 blur-[260px]" />
        <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_18%_12%,rgba(91,10,25,0.20),transparent_56%),radial-gradient(900px_circle_at_78%_22%,rgba(91,10,25,0.12),transparent_58%)]" />
      </div>

      {/* Grain */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(242,236,226,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(242,236,226,0.10)_1px,transparent_1px)] [background-size:3px_3px]" />

      <div className="page-wrap px-6 py-7 md:px-10 md:py-10">
        {/* Header: minimal + aligned */}
        <header className="page-header bg-transparent backdrop-blur-0">
          <div className="flex items-center gap-3">
            <Wordmark />
            <span className="badge hidden border-white/10 md:inline-flex">
              MEMBERS-ONLY
            </span>
          </div>
        </header>

        {/* Main: true luxury composition */}
        <div className="mx-auto w-full max-w-6xl">
          <main className="relative grid items-center gap-8 py-14 md:grid-cols-12 md:gap-8 md:py-16">
            <div className="pointer-events-none absolute inset-y-[15%] left-[58.333%] hidden w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/10 to-transparent md:block" />

            {/* Left: editorial */}
            <section className="panel p-8 md:col-span-7 md:p-10">
            <div className="inline-flex items-center justify-center mx-auto gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-oxblood" />
              <p className="eyebrow tracking-[0.22em]">
                private membership
              </p>
            </div>

            <h1 className="title-hero font-display mt-4 tracking-[-0.07em] text-[3.1rem] leading-[1.02] md:text-[3.6rem]">
              Entitled
            </h1>

            <p className="lead mt-4 max-w-[46ch] text-[1.02rem] leading-relaxed">
              Members-only access to premium menswear at unbeatable value.
            </p>

            <ul className="mt-6 max-w-2xl list-disc space-y-2 pl-5 text-[0.98rem] leading-snug text-white/95">
              <li>Curated drops. Limited quantities.</li>
              <li>Premium brands. Top-notch quality.</li>
              <li>Members-first support on WhatsApp.</li>
            </ul>

            <div className="mt-6 inline-flex items-center justify-center mx-auto gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/85">
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

            {/* Right: compact access module */}
            <section className="relative md:col-span-5">
              <div className="pointer-events-none absolute -inset-12 rounded-[34px] bg-oxblood/10 blur-3xl" />

              <div className="panel-strong relative w-full max-w-[380px] p-8 shadow-[0_50px_170px_rgba(0,0,0,0.75)] md:p-10">
                <p className="eyebrow tracking-[0.28em]">
                  vault access
                </p>

                <h2 className="title-section font-display mt-3 text-[1.8rem] tracking-[-0.04em]">
                  Access Entitled
                </h2>

                <p className="lead mt-2">
                  Existing members log in instantly. New members can request access in under 2 minutes.
                </p>

                <form className="mt-7 w-full max-w-[460px]" onSubmit={handleContinue}>
                  <div className="flex items-center gap-3">
                    <input
                      className="field-input h-10 px-4 placeholder:text-white/30"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 90000 00000"
                      type="tel"
                      autoComplete="tel"
                      inputMode="tel"
                      aria-invalid={Boolean(err)}
                      disabled={loading}
                    />
                    <button
                      className="h-10 rounded-xl bg-oxblood px-4 text-sm font-semibold text-white shadow-[0_18px_55px_rgba(91,10,25,0.35)] transition duration-200 hover:scale-[1.02] hover:bg-[#6b0d1f] hover:shadow-[0_22px_65px_rgba(107,13,31,0.45)] active:scale-[0.99] focus-visible:ring-4 focus-visible:ring-oxblood/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-70"
                      type="submit"
                      disabled={loading || !isValidPhone}
                    >
                      {loading ? "Checking…" : "Continue"}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-white/70">We&apos;ll route you based on your membership status.</p>
                  {ok ? (
                    <p className="mt-2 text-xs text-[#9ce5b8]" role="status">
                      {ok}
                    </p>
                  ) : null}
                  {err ? (
                    <p className="mt-2 text-xs text-[#f2a6b4]" role="alert">
                      {err}
                    </p>
                  ) : null}
                </form>

                {/* Premium micro-strip */}
                <div className="mt-7 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-xs text-white/80">
                  No OTP. No password. Phone verification against membership access.
                </div>
              </div>
            </section>
          </main>
        </div>

        <footer className="mt-auto pb-2 text-xs text-white/65">
          © 2026 Entitled. Members-only.
        </footer>
      </div>
    </div>
  );
}
