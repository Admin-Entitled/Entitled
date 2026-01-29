import { useState } from "react";
import Protected from "./components/Protected";
import Login from "./pages/Login";
import AdminPanel from "./pages/AdminPanel";

export default function App() {
  // Protected component decides if user is logged in, but we keep a fallback.
  const [forceAuthed, setForceAuthed] = useState(false);

  if (!forceAuthed) {
    return <Login onSuccess={() => setForceAuthed(true)} />;
  }

  return (
    <Protected>
      <AdminPanel />
    </Protected>
  );
}
