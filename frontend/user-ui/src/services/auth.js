import axios from "axios";

const DEFAULT_API_BASE = import.meta.env.DEV
  ? "http://localhost:4000"
  : "https://api.entitledclub.com";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || DEFAULT_API_BASE,
  withCredentials: true,
});

async function postWithFallback(primaryPath, fallbackPath, payload) {
  try {
    return await api.post(primaryPath, payload);
  } catch (error) {
    if (error?.response?.status === 404) {
      console.warn("[AUTH_API] Primary route returned 404, retrying fallback", {
        primaryPath,
        fallbackPath,
      });
      try {
        return await api.post(fallbackPath, payload);
      } catch (fallbackError) {
        if (fallbackError?.response?.status === 404) {
          const endpointError = new Error("Login API endpoint not found on server");
          endpointError.code = "AUTH_ENDPOINT_NOT_FOUND";
          endpointError.details = { primaryPath, fallbackPath };
          throw endpointError;
        }
        throw fallbackError;
      }
    }
    throw error;
  }
}

export function register(payload) {
  return postWithFallback("/auth/register", "/api/auth/register", payload);
}

export function login(payload) {
  return postWithFallback("/auth/login", "/api/auth/login", payload);
}

export function exchangeAccess(token) {
  return api.get(`/access?token=${encodeURIComponent(token)}`);
}

export function membershipStatus(phone) {
  return api.get(`/api/membership/status?phone=${encodeURIComponent(phone)}`);
}

export default api;
