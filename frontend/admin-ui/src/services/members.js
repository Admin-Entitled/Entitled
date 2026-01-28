import api from "../api";

export async function fetchMembers(filters = {}) {
  const params = new URLSearchParams();

  if (filters.status) params.append("status", filters.status);
  if (filters.state) params.append("state", filters.state);
  if (filters.city) params.append("city", filters.city);

  const res = await api.get(`/admin/members?${params.toString()}`);
  return res.data;
}

export async function approveMember(id) {
  const res = await api.post(`/admin/approve/${id}`);
  return res.data;
}

export async function approveAll(filters = {}) {
  const res = await api.post("/admin/approve-all", filters);
  return res.data;
}

export async function removeMember(id) {
  const res = await api.delete(`/admin/remove/${id}`);
  return res.data;
}

export async function removeAll(filters = {}) {
  const res = await api.post("/admin/remove-all", filters);
  return res.data;
}

export async function removeByPhones(phones) {
  const res = await api.post("/admin/remove-by-phones", { phones });
  return res.data;
}

export async function fetchAuditLogs() {
  const res = await api.get("/admin/audit-logs");
  return res.data;
}
