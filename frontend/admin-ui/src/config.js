const DEFAULT_API_BASE = import.meta.env.DEV
  ? "http://localhost:4000"
  : "https://api.entitledclub.com";

export const API_BASE = import.meta.env.VITE_API_BASE || DEFAULT_API_BASE;
