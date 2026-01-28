import axios from "axios";

export const api = axios.create({
  baseURL: "https://auth.entitledclub.com",
  withCredentials: true, // REQUIRED for cookies
});
