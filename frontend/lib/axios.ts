import axios from "axios";

/**
 * Axios Instance
 *
 * Centralized HTTP client for all API communication with the Express backend.
 * Uses Authorization header with Bearer token from localStorage.
 */

const API = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor to attach token to every request
API.interceptors.request.use((req) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) {
    req.headers.Authorization = `Bearer ${token}`;
  }
  return req;
});

export default API;