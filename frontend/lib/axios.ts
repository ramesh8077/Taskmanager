/**
 * Axios Instance
 *
 * Centralized HTTP client for all API communication with the Express backend.
 *
 * CRITICAL: `withCredentials: true` ensures the browser sends HTTP-Only
 * cookies (containing the JWT) with every cross-origin request.
 */

import axios from "axios";

const API = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export default API;
