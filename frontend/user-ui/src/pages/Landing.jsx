import { useNavigate } from "react-router-dom";

export default function Landing() {
  const nav = useNavigate();

  return (
    <div style={{ padding: 40 }}>
      <h1>Entitled Club</h1>
      <p>Private access to curated premium fashion.</p>

      <button onClick={() => nav("/register")}>
        Apply for Membership
      </button>

      <br /><br />

      <button onClick={() => nav("/login")}>
        Member Login
      </button>
    </div>
  );
}
