import { api } from "../api";

export async function fetchMembers(filters = {}) {
  const params = {};
  if (filters.status) params.status = filters.status;
  if (filters.state) params.state = filters.state;
  if (filters.city) params.city = filters.city;

  const res = await api.get("/admin/members", { params });
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
