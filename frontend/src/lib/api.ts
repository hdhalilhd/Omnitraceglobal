import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

export const api = axios.create({ baseURL: `${API_BASE}/api` });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && location.pathname !== "/login") {
      localStorage.removeItem("token");
      location.href = "/login";
    }
    return Promise.reject(err);
  },
);
