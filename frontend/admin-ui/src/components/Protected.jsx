import { useEffect, useState } from "react";
import { adminMe } from "../services/adminAuth";
import Login from "../pages/Login";

export default function Protected({ children }) {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  async function check() {
    try {
      await adminMe();
      setLoggedIn(true);
    } catch {
      setLoggedIn(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    check();
  }, []);

  if (loading) return <p>Checking session...</p>;
  if (!loggedIn) return <Login onSuccess={check} />;

  return children;
}
