export default function Approved() {
    const token = localStorage.getItem("entitled_access_token");
  
    return (
      <div style={{ padding: 40 }}>
        <h2>Access Granted</h2>
        <p>Your membership is approved.</p>
        <p><b>Token ready:</b> {token}</p>
        <p>You’ll be redirected to the store shortly.</p>
      </div>
    );
  }
  