import { useState } from "react";
import { registerUser } from "../services/auth";

export default function Register() {
  const [form, setForm] = useState({
    name: "",
    phone: "",
    city: "",
    state: "",
  });

  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    await registerUser(form);
    setDone(true);
  }

  if (done) {
    return <h3>Application submitted. Await approval.</h3>;
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>Apply for Membership</h2>
      <form onSubmit={handleSubmit}>
        <input
          placeholder="Name"
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <br />
        <input
          placeholder="Phone"
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <br />
        <input
          placeholder="City"
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
        <br />
        <input
          placeholder="State"
          onChange={(e) => setForm({ ...form, state: e.target.value })}
        />
        <br />
        <br />
        <button type="submit">Apply</button>
      </form>
    </div>
  );
}
