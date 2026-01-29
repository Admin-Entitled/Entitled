import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || "https://api.entitledclub.com",
  withCredentials: true,
});

export function register(payload) {
  return api.post("/auth/register", payload);
}

export function login(payload) {
  return api.post("/auth/login", payload);
}

export function exchangeAccess(token) {
  return api.get(`/access?token=${encodeURIComponent(token)}`);
}

export default api;
