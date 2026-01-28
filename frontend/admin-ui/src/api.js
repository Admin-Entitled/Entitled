import axios from "axios";
import { API_BASE } from "./config";

// 👉 ENTER YOUR ADMIN PHONE NUMBER HERE
const ADMIN_PHONE = "7830171777";

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    "x-admin-phone": ADMIN_PHONE,
    "Content-Type": "application/json",
  },
});
