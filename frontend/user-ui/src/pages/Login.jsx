import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { exchangeAccess, login } from "../services/auth";
import Wordmark from "../components/Wordmark";
import WhatsAppSupportIcon from "../assets/whatsapp-support-icon.png";

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

function normalizePhone(raw) {
  let digits = String(raw || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length > 10) {
    digits = digits.slice(2);
  }
  return digits;
}

export default function Login() {
  const nav = useNavigate();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setErr("");
    setOk("");
    setLoading(true);
    const trimmedPhone = normalizePhone(phone);
    console.log("[LOGIN] Submit started", {
      phoneLength: trimmedPhone.length,
      phonePreview: trimmedPhone ? `***${trimmedPhone.slice(-4)}` : "",
    });
    try {
      const res = await login({ phone: trimmedPhone });
      const statusRaw = res?.data?.status;
      const status = typeof statusRaw === "string" ? statusRaw.toLowerCase() : "";
      console.log("[LOGIN] /auth/login response", {
        status,
        hasToken: Boolean(res?.data?.token),
      });

      if (status === "approved") {
        if (!res?.data?.token) {
          console.error("[LOGIN] Approved response missing token");
          setErr("Missing access token");
          return;
        }

        const token = res.data.token;
        localStorage.setItem("entitled_access_token", token);
        console.log("[LOGIN] Access token saved to localStorage");

        const accessRes = await exchangeAccess(token);
        const password = accessRes?.data?.password;
        const backendShopUrl = accessRes?.data?.shop_url;
        console.log("[LOGIN] /access exchange response", {
          hasPassword: Boolean(password),
          hasBackendShopUrl: Boolean(backendShopUrl),
        });

        if (!password) {
          console.error("[LOGIN] /access returned no password");
          setErr("Access token invalid");
          return;
        }

        if (!submitShopifyPassword(backendShopUrl, password)) {
          console.error("[LOGIN] Missing Shopify URL config", {
            hasBackendShopUrl: Boolean(backendShopUrl),
          });
          setErr("Shopify URL is not configured. Please contact support.");
          return;
        }
        console.log("[LOGIN] Redirecting to Shopify password endpoint");
        setOk("Access granted.");
      } else if (status === "pending") {
        console.warn("[LOGIN] Membership pending approval");
        nav("/pending");
      } else if (status === "not_found") {
        console.warn("[LOGIN] Membership not found, redirecting to register");
        nav("/register", { state: { phone: trimmedPhone } });
      } else {
        console.warn("[LOGIN] Non-approved status received", { status });
        setErr("Could not verify membership status. Please try again.");
      }
    } catch (e2) {
      console.error("[LOGIN] Request failed", {
        message: e2?.message,
        status: e2?.response?.status,
        apiError: e2?.response?.data?.error,
      });
      setErr(e2?.response?.data?.error || "Login failed");
    } finally {
      console.log("[LOGIN] Submit finished");
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

      {/* Subtle grain */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] [background-image:linear-gradient(rgba(242,236,226,0.10)_1px,transparent_1px),linear-gradient(90deg,rgba(242,236,226,0.10)_1px,transparent_1px)] [background-size:3px_3px]" />

      <div className="page-wrap">
        {/* Header */}
        <header className="page-header bg-transparent backdrop-blur-0">
          <div className="flex items-center gap-3">
            <Wordmark className="h-4 w-auto md:h-[18px]" />
            <span className="badge bg-base/60">
              MEMBER LOGIN
            </span>
          </div>

          {/* keep only ONE “Apply” in header (remove duplicates below) */}
          <Link className="link-inline" to="/register">
            Apply for access
          </Link>
        </header>

        <main className="my-auto grid gap-8 py-10 md:grid-cols-2 md:items-center md:gap-14 md:py-14">
          {/* LEFT: Brand panel */}
          <section className="panel relative overflow-hidden p-8 md:p-10">
            <div className="pointer-events-none absolute -left-32 top-10 h-64 w-64 rounded-full bg-oxblood/22 blur-[90px]" />

            <p className="eyebrow relative mb-4 tracking-[0.26em]">
              private membership
            </p>

            <h1 className="title-hero font-display relative">
              Entitled
            </h1>

            <p className="lead relative mt-5 max-w-xl">
              Members-only access to premium menswear at unbeatable value.
            </p>

            <ul className="relative mt-6 list-disc space-y-2 pl-5 text-sm leading-snug text-white/95">
              <li>Curated drops. Limited quantities.</li>
              <li>Premium brands. Top-notch quality.</li>
              <li>Members-first support on WhatsApp.</li>
            </ul>

            <div className="relative mt-10 inline-flex items-center justify-center mx-auto gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/85">
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

          {/* RIGHT: Login card */}
          <section className="panel-strong md:p-10">
            <p className="eyebrow tracking-[0.26em]">
              vault access
            </p>

            <h2 className="title-section font-display mt-3 text-[1.85rem] tracking-[-0.03em]">
              Member Login
            </h2>

            <p className="lead mt-2" id="login-instructions">
              Enter your phone number to continue.
            </p>

            <form className="mt-7" onSubmit={handleSubmit} aria-busy={loading}>
              <div>
                <label className="field-label tracking-[0.20em]" htmlFor="login-phone">
                  Phone Number
                </label>

                <input
                  className="field-input px-4 placeholder:text-white/30"
                  id="login-phone"
                  name="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 9000000000"
                  type="tel"
                  autoComplete="tel"
                  inputMode="numeric"
                  aria-describedby="login-instructions login-status"
                  aria-invalid={Boolean(err)}
                  required
                  disabled={loading}
                />
              </div>

              {/* Status */}
              {err || ok ? (
                <div
                  className={`${err ? "status-err" : "status-ok"} mt-4`}
                  id="login-status"
                  role={err ? "alert" : "status"}
                  aria-live={err ? "assertive" : "polite"}
                >
                  {err || ok}
                </div>
              ) : null}

              <div className="mt-6">
                <button
                  className="btn-primary flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-oxblood/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  type="submit"
                  disabled={loading}
                >
                  {loading && (
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-light/45 border-t-light"
                      aria-hidden="true"
                    />
                  )}
                  {loading ? "Checking…" : "Continue"}
                </button>

                {/* remove duplicate Apply link here for cleaner luxury */}
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
              </div>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}
