import { useNavigate } from "react-router-dom";
import wordmark from "../assets/entitled-wordmark.jpg";

export default function Landing() {
  const nav = useNavigate();

  return (
    <div className="container">
      <div className="shell">
        <div className="topbar">
          <div className="wordmarkSlot">
            <img className="wordmarkImg" src={wordmark} alt="Entitled Club" />
            <span className="badge">Members-only Access</span>
          </div>
          <div className="rowWrap">
            <button className="btn btnMetal" onClick={() => nav("/login")}>
              Member Login
            </button>
            <button className="btn btnPrimary" onClick={() => nav("/register")}>
              Request Access
            </button>
          </div>
        </div>

        <div className="hero heroMinimal">
          <div className="heroCopy">
            <div className="pill">Members-only • Controlled access</div>
            <h1 className="display">
              Entitled Club
              <span className="displayAccent"> is entry, not exposure.</span>
            </h1>
            <p className="lead">
              A members-only luxury menswear club delivering curated limited drops with verified authenticity.
              Quiet, precise, and intentionally scarce.
            </p>
            <div className="rowWrap">
              <button className="btn btnPrimary" onClick={() => nav("/register")}>
                Request Access
              </button>
              <button className="btn btnMetal" onClick={() => nav("/login")}>
                Member Login
              </button>
            </div>
            <div className="heroMeta minimalMeta">
              <div className="metaItem">
                <div className="metaLabel">Verification</div>
                <div className="metaValue">Proof-backed only</div>
              </div>
              <div className="metaItem">
                <div className="metaLabel">Scarcity</div>
                <div className="metaValue">Limited drops, closed archives</div>
              </div>
            </div>
          </div>
        </div>

        <div className="section minimalSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">Membership protocol</h2>
            <p className="sub">Request access → Review → Approved entry.</p>
          </div>
          <div className="minimalStrip">
            <div className="stripItem">
              <div className="stripTitle">Request</div>
              <div className="stripBody">Short application. Essential data only.</div>
            </div>
            <div className="stripItem">
              <div className="stripTitle">Verify</div>
              <div className="stripBody">Authenticity-first review.</div>
            </div>
            <div className="stripItem">
              <div className="stripTitle">Access</div>
              <div className="stripBody">Approved members unlock the store.</div>
            </div>
          </div>
        </div>

        <div className="ctaStrip minimalCta">
          <div>
            <div className="ctaTitle">Entry is controlled.</div>
            <div className="ctaSub">If approved, your phone number is your key.</div>
          </div>
          <button className="btn btnPrimary" onClick={() => nav("/register")}>
            Apply Now
          </button>
        </div>
      </div>
    </div>
  );
}
