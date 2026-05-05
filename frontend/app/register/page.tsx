"use client";

/**
 * Register Page
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function RegisterPage() {
  const { register, isAuthenticated, loading: authLoading } = useAuth();
  const router = useRouter();

  const [form, setForm] = useState({ name: "", email: "", password: "", role: "Member" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && isAuthenticated) router.replace("/dashboard");
  }, [authLoading, isAuthenticated, router]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required.";
    else if (form.name.trim().length < 2) e.name = "Name must be at least 2 characters.";
    if (!form.email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Please enter a valid email.";
    if (!form.password) e.password = "Password is required.";
    else if (form.password.length < 6) e.password = "Password must be at least 6 characters.";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    try {
      setSubmitting(true);
      await register({ name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role });
    } catch {
      /* toast handled in context */
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = ev.target;
    setForm((p) => ({ ...p, [name]: value }));
    if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-primary">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (isAuthenticated) return null;

  return (
    <main className="min-h-screen flex items-center justify-center bg-surface-primary px-4 py-12">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-brand-600/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-indigo-500/15 rounded-full blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 mb-4 shadow-lg shadow-brand-500/20">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create an account</h1>
          <p className="text-gray-400 mt-1 text-sm">Join Team Task Manager and start collaborating</p>
        </div>

        <div className="bg-surface-card border border-border-subtle rounded-2xl p-8 backdrop-blur-sm shadow-2xl shadow-black/40">
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Name */}
            <div>
              <label htmlFor="register-name" className="block text-sm font-medium text-gray-300 mb-1.5">Full Name</label>
              <input id="register-name" name="name" type="text" autoComplete="name" value={form.name} onChange={handleChange} placeholder="John Doe"
                className={`w-full px-4 py-2.5 rounded-xl bg-surface-input border text-white placeholder-gray-500 text-sm transition-all duration-200 focus:bg-surface-input-focus focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 outline-none ${errors.name ? "border-red-500/60" : "border-border-default"}`}
              />
              {errors.name && <p className="mt-1.5 text-xs text-red-400">{errors.name}</p>}
            </div>

            {/* Email */}
            <div>
              <label htmlFor="register-email" className="block text-sm font-medium text-gray-300 mb-1.5">Email Address</label>
              <input id="register-email" name="email" type="email" autoComplete="email" value={form.email} onChange={handleChange} placeholder="you@example.com"
                className={`w-full px-4 py-2.5 rounded-xl bg-surface-input border text-white placeholder-gray-500 text-sm transition-all duration-200 focus:bg-surface-input-focus focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 outline-none ${errors.email ? "border-red-500/60" : "border-border-default"}`}
              />
              {errors.email && <p className="mt-1.5 text-xs text-red-400">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label htmlFor="register-password" className="block text-sm font-medium text-gray-300 mb-1.5">Password</label>
              <input id="register-password" name="password" type="password" autoComplete="new-password" value={form.password} onChange={handleChange} placeholder="••••••••"
                className={`w-full px-4 py-2.5 rounded-xl bg-surface-input border text-white placeholder-gray-500 text-sm transition-all duration-200 focus:bg-surface-input-focus focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 outline-none ${errors.password ? "border-red-500/60" : "border-border-default"}`}
              />
              {errors.password && <p className="mt-1.5 text-xs text-red-400">{errors.password}</p>}
            </div>

            {/* Role */}
            <div>
              <label htmlFor="register-role" className="block text-sm font-medium text-gray-300 mb-1.5">Role</label>
              <div className="relative">
                <select id="register-role" name="role" value={form.role} onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-xl bg-surface-input border border-border-default text-white text-sm transition-all duration-200 focus:bg-surface-input-focus focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 outline-none appearance-none cursor-pointer"
                >
                  <option value="Member">Member</option>
                  <option value="Admin">Admin</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            <button type="submit" disabled={submitting}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 text-white font-semibold text-sm tracking-wide transition-all duration-200 hover:from-brand-500 hover:to-brand-400 hover:shadow-lg hover:shadow-brand-500/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating account…
                </span>
              ) : "Create Account"}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border-subtle text-center">
            <p className="text-sm text-gray-400">
              Already have an account?{" "}
              <Link href="/login" className="text-brand-400 hover:text-brand-200 font-medium transition-colors">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
