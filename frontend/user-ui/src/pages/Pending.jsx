import wordmark from "../assets/entitled-wordmark.jpg";

export default function Pending() {
  return (
    <div className="container">
      <div className="shell">
        <div className="topbar">
          <div className="wordmarkSlot">
            <img className="wordmarkImg" src={wordmark} alt="Entitled Club" />
            <span className="badge">Under Review</span>
          </div>
          <a className="btn btnMetal" href="/login">
            Member Login
          </a>
        </div>
        <div style={{ padding: 30 }}>
          <div className="card">
            <h1 className="h1">Application received</h1>
            <p className="sub">
              Your membership is under review. You’ll be granted access once approved.
            </p>
            <div className="hr" />
            <div className="rowWrap">
              <div className="pill">Status: Pending</div>
              <div className="pill">Review window: 24–72 hours</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
  
