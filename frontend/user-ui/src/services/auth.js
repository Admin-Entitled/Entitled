import axios from "axios";

const api = axios.create({
  baseURL: "https://auth.entitledclub.com",
  withCredentials: true,
});

export default api;
