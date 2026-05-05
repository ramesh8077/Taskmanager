"use client";

/**
 * Dashboard Page (Placeholder)
 *
 * Protected route — only accessible to authenticated users.
 * The full dashboard UI will be built in a later part.
 */

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { user, logout } = useAuth();

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-surface-primary">
        {/* ── Top Navigation Bar ───────────────────────────────────────── */}
        <nav className="border-b border-border-subtle bg-surface-card/60 backdrop-blur-md sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md shadow-brand-500/15">
                <svg
                  className="w-5 h-5 text-white"
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
              <span className="text-white font-semibold text-lg tracking-tight hidden sm:block">
                Task Manager
              </span>
            </div>

            {/* User Info & Logout */}
            <div className="flex items-center gap-4">
              {/* User Badge */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white text-xs font-bold uppercase">
                  {user?.name?.charAt(0) || "?"}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium text-white leading-none">
                    {user?.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{user?.role}</p>
                </div>
              </div>

              {/* Logout Button */}
              <button
                onClick={logout}
                className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-gray-300 border border-border-default hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 cursor-pointer"
              >
                Logout
              </button>
            </div>
          </div>
        </nav>

        {/* ── Dashboard Content Placeholder ─────────────────────────────── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-fade-in">
            <h1 className="text-3xl font-bold text-white mb-2">
              Welcome, {user?.name} 👋
            </h1>
            <p className="text-gray-400 mb-10">
              You are logged in as{" "}
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-brand-500/15 text-brand-400 border border-brand-500/20">
                {user?.role}
              </span>
            </p>

            {/* Placeholder Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {["Projects", "Tasks", "Team Members"].map((item) => (
                <div
                  key={item}
                  className="bg-surface-card border border-border-subtle rounded-2xl p-6 hover:border-border-default transition-colors duration-200"
                >
                  <div className="w-10 h-10 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-4">
                    <div className="w-4 h-4 rounded-md bg-brand-500/40" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {item}
                  </h3>
                  <p className="text-sm text-gray-500">
                    Dashboard UI coming in the next part.
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
