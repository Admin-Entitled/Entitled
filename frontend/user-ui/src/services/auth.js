import axios from "axios";

const API = "https://api.entitledclub.com";

export async function registerUser(data) {
  const res = await axios.post(`${API}/api/register`, data);
  return res.data;
}

export async function loginUser(phone) {
  const res = await axios.post(`${API}/api/login`, { phone });
  return res.data;
}
