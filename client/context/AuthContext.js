"use client";

/**
 * Auth Context
 *
 * Provides global authentication state and actions across the app:
 *   - `user`             → The authenticated user object (or null).
 *   - `isAuthenticated`  → Boolean derived from the user state.
 *   - `loading`          → True while an auth operation is in-flight.
 *   - `login(data)`      → Authenticates user & updates state.
 *   - `register(data)`   → Creates account & updates state.
 *   - `logout()`         → Clears cookie & resets state.
 *
 * On mount, it calls the backend's `/auth/me` endpoint (or relies on
 * the login response) to restore session from the HTTP-Only cookie.
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import API from "@/lib/axios";

// ─── Create Context ──────────────────────────────────────────────────────────

const AuthContext = createContext(null);

// ─── Provider Component ──────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true); // True on initial mount
  const router = useRouter();

  const isAuthenticated = !!user;

  // ── Verify session on initial mount ──────────────────────────────────────
  // Attempts to fetch the current user from a persisted JWT cookie.
  // If the cookie is expired or missing, silently sets user to null.

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await API.get("/auth/me");

      if (data.success) {
        setUser(data.data.user);
      } else {
        setUser(null);
      }
    } catch {
      // No valid session — user is not authenticated
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // ── Login ────────────────────────────────────────────────────────────────

  const login = async ({ email, password }) => {
    try {
      setLoading(true);
      const { data } = await API.post("/auth/login", { email, password });

      if (data.success) {
        setUser(data.data.user);
        toast.success(data.message || "Login successful!");
        router.push("/dashboard");
      }

      return data;
    } catch (error) {
      const message =
        error.response?.data?.message || "Login failed. Please try again.";
      toast.error(message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // ── Register ─────────────────────────────────────────────────────────────

  const register = async ({ name, email, password, role }) => {
    try {
      setLoading(true);
      const { data } = await API.post("/auth/register", {
        name,
        email,
        password,
        role,
      });

      if (data.success) {
        toast.success(data.message || "Registration successful! Please log in.");
        router.push("/login");
      }

      return data;
    } catch (error) {
      const message =
        error.response?.data?.message || "Registration failed. Please try again.";
      toast.error(message);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  // ── Logout ───────────────────────────────────────────────────────────────

  const logout = async () => {
    try {
      setLoading(true);
      const { data } = await API.post("/auth/logout");
      setUser(null);
      toast.success(data?.message || "Logged out successfully.");
      router.push("/login");
    } catch {
      // Force-clear state even if the API call fails
      setUser(null);
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  // ── Context Value ────────────────────────────────────────────────────────

  const value = {
    user,
    isAuthenticated,
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Custom Hook ─────────────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within an <AuthProvider>.");
  }

  return context;
}

export default AuthContext;
