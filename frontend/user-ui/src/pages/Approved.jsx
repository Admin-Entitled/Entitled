import wordmark from "../assets/entitled-wordmark.jpg";

export default function Approved() {
  const token = localStorage.getItem("entitled_access_token");

  return (
    <div className="container">
      <div className="shell">
        <div className="topbar">
          <div className="wordmarkSlot">
            <img className="wordmarkImg" src={wordmark} alt="Entitled Club" />
            <span className="badge">Access Granted</span>
          </div>
          <a className="btn btnMetal" href="/login">
            Member Login
          </a>
        </div>
        <div style={{ padding: 30 }}>
          <div className="card">
            <h1 className="h1">You’re in.</h1>
            <p className="sub">Your membership is approved.</p>
            <div className="hr" />
            <div className="rowWrap">
              <div className="pill">Token ready</div>
              <div className="pill pillApproved">Verified</div>
            </div>
            {token && (
              <div className="tokenBox">
                <div className="tokenLabel">Access token</div>
                <div className="tokenValue">{token}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
  
