import { Link } from "react-router-dom";
import Wordmark from "../components/Wordmark";
import WhatsAppSupportIcon from "../assets/whatsapp-support-icon.png";

export default function Approved() {
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
              Access Granted
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
            <p className="eyebrow">Membership Status</p>
            <h2 className="title-section font-display mt-3">You&apos;re in.</h2>
            <p className="lead mt-2">Your membership is approved.</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <span className="chip">
                Token ready
              </span>
              <span className="chip border-ok/55 bg-ok/20 text-white">
                Verified
              </span>
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
          </section>
        </main>
      </div>
    </div>
  );
}
  
