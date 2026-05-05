"use client";

/**
 * ProtectedRoute HOC
 *
 * Wraps any page/component that requires authentication.
 *   - While `loading` is true  → shows a full-screen spinner.
 *   - If not authenticated     → redirects to /login.
 *   - If authenticated         → renders children.
 *
 * Usage:
 *   <ProtectedRoute>
 *     <DashboardContent />
 *   </ProtectedRoute>
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [loading, isAuthenticated, router]);

  // ── Loading State ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm tracking-wide">
            Verifying session...
          </p>
        </div>
      </div>
    );
  }

  // ── Not Authenticated (redirect in progress) ─────────────────────────────
  if (!isAuthenticated) {
    return null;
  }

  // ── Authenticated ─────────────────────────────────────────────────────────
  return <>{children}</>;
}
