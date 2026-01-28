import { api } from "../api";

export async function adminLogin(phone, password) {
  const res = await api.post("/admin/auth/login", { phone, password });
  return res.data;
}

export async function adminMe() {
  const res = await api.get("/admin/auth/me");
  return res.data;
}

export async function adminLogout() {
  await api.post("/admin/auth/logout");
}
