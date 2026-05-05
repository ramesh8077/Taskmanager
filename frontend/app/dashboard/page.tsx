"use client";

/**
 * Dashboard Page
 *
 * Protected route that renders:
 *   - AdminDashboard  when user.role === "Admin"
 *   - MemberDashboard when user.role === "Member"
 *
 * Includes theme toggle (dark/light mode) in the navbar.
 */

import ProtectedRoute from "@/components/ProtectedRoute";
import AdminDashboard from "@/components/AdminDashboard";
import MemberDashboard from "@/components/MemberDashboard";
import TicketDashboard from "@/components/TicketDashboard";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useState } from "react";

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<"tasks" | "tickets">("tasks");

  return (
    <ProtectedRoute>
      <main className="min-h-screen pb-20" style={{ background: "var(--background)" }}>
        {/* ── Navbar ──────────────────────────────────────────────────────── */}
        <nav
          className="border-b backdrop-blur-md sticky top-0 z-50 transition-colors"
          style={{
            background: "var(--nav-bg)",
            borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-500/15">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <span className="font-semibold text-lg tracking-tight hidden md:block t-text-primary">Task Manager</span>
              </div>

              {/* Tab Switcher */}
              <div className="flex items-center bg-black/5 dark:bg-white/5 p-1 rounded-xl border border-black/10 dark:border-white/10">
                <button
                  onClick={() => setActiveTab("tasks")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "tasks" ? "bg-brand-500 text-white shadow-md shadow-brand-500/25" : "t-text-muted hover:t-text-primary"
                  }`}
                >
                  Tasks
                </button>
                <button
                  onClick={() => setActiveTab("tickets")}
                  className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === "tickets" ? "bg-brand-500 text-white shadow-md shadow-brand-500/25" : "t-text-muted hover:t-text-primary"
                  }`}
                >
                  Tickets
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all cursor-pointer group"
                style={{
                  background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                }}
                title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                id="theme-toggle-btn"
              >
                <span className="text-lg transition-transform group-hover:scale-110">
                  {isDark ? "☀️" : "🌙"}
                </span>
              </button>

              {/* User Info */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold uppercase">
                  {user?.name?.charAt(0) || "?"}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium leading-none t-text-primary">{user?.name}</p>
                  <p className="text-xs t-text-muted mt-0.5">{user?.role}</p>
                </div>
              </div>

              {/* Logout */}
              <button
                onClick={logout}
                className="px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer"
                style={{
                  color: isDark ? "#d1d5db" : "#475569",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
                }}
                id="logout-btn"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        {/* ── Content ─────────────────────────────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === "tasks" ? (
            <>
              <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-bold t-text-primary">
                  Welcome, {user?.name} 👋
                </h1>
                <p className="t-text-secondary mt-1 text-sm">
                  Logged in as{" "}
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-500/15 text-brand-400 border border-brand-500/20">
                    {user?.role}
                  </span>
                </p>
              </div>
              {user?.role === "Admin" ? <AdminDashboard /> : <MemberDashboard />}
            </>
          ) : (
            <TicketDashboard />
          )}
        </div>
      </main>
    </ProtectedRoute>
  );
}
