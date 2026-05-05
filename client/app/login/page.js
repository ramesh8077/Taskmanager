"use client";

/**
 * Login Page
 *
 * Premium dark-themed login form with:
 *   - Email & password validation
 *   - Loading state with disabled submit
 *   - Auto-redirect if already authenticated
 *   - Toast notifications via Sonner
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function LoginPage() {
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  // ── Form State ──────────────────────────────────────────────────────────
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // ── Redirect if already authenticated ───────────────────────────────────
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [authLoading, isAuthenticated, router]);

  // ── Validation ──────────────────────────────────────────────────────────
  const validate = () => {
    const newErrors = {};

    if (!form.email.trim()) {
      newErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = "Please enter a valid email.";
    }

    if (!form.password) {
      newErrors.password = "Password is required.";
    } else if (form.password.length < 6) {
      newErrors.password = "Password must be at least 6 characters.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Submit Handler ──────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setSubmitting(true);
      await login({ email: form.email, password: form.password });
    } catch {
      // Error toast is handled in AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  // ── Input Change Handler ────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    // Clear field error on change
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  // ── Don't render form while checking auth ───────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-primary">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) return null;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-primary px-4 py-12">
      {/* Background Gradient Orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-brand-600/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 w-[400px] h-[400px] bg-indigo-500/15 rounded-full blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* ── Brand Header ─────────────────────────────────────────────── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 mb-4 shadow-lg shadow-brand-500/20">
            <svg
              className="w-7 h-7 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Welcome back
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            Sign in to your Team Task Manager account
          </p>
        </div>

        {/* ── Card ─────────────────────────────────────────────────────── */}
        <div className="bg-surface-card border border-border-subtle rounded-2xl p-8 backdrop-blur-sm shadow-2xl shadow-black/40">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-medium text-gray-300 mb-1.5"
              >
                Email Address
              </label>
              <input
                id="login-email"
                name="email"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                className={`w-full px-4 py-2.5 rounded-xl bg-surface-input border text-white placeholder-gray-500 text-sm transition-all duration-200 focus:bg-surface-input-focus focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 outline-none ${
                  errors.email ? "border-red-500/60" : "border-border-default"
                }`}
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-400">{errors.email}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-medium text-gray-300 mb-1.5"
              >
                Password
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                value={form.password}
                onChange={handleChange}
                placeholder="••••••••"
                className={`w-full px-4 py-2.5 rounded-xl bg-surface-input border text-white placeholder-gray-500 text-sm transition-all duration-200 focus:bg-surface-input-focus focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 outline-none ${
                  errors.password
                    ? "border-red-500/60"
                    : "border-border-default"
                }`}
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-400">{errors.password}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 text-white font-semibold text-sm tracking-wide transition-all duration-200 hover:from-brand-500 hover:to-brand-400 hover:shadow-lg hover:shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none cursor-pointer"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          {/* ── Divider ──────────────────────────────────────────────────── */}
          <div className="mt-6 pt-6 border-t border-border-subtle text-center">
            <p className="text-sm text-gray-400">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="text-brand-400 hover:text-brand-200 font-medium transition-colors"
              >
                Create one
              </Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
