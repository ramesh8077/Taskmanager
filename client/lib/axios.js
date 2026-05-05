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
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api",
  withCredentials: true, // Sends cookies with every request
  headers: {
    "Content-Type": "application/json",
  },
});

export default API;
