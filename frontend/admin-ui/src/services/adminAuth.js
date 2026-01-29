import api from "../api";

export async function adminLogin(phone, password) {
  const res = await api.post("/admin/auth/login", {
    phone,
    password,
  });
  return res.data;
}

export async function adminMe() {
  const res = await api.get("/admin/auth/me");
  return res.data;
}

export async function adminLogout() {
  const res = await api.post("/admin/auth/logout");
  return res.data;
}

export async function createAdmin(phone, password) {
  const res = await api.post("/admin/auth/create-admin", {
    phone,
    password,
  });
  return res.data;
}

export async function changeAdminPassword(currentPassword, newPassword) {
  const res = await api.post("/admin/auth/change-password", {
    currentPassword,
    newPassword,
  });
  return res.data;
}
