"use client";

/**
 * Root Page
 *
 * Redirects to /login or /dashboard based on auth state.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export default function HomePage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      router.replace(isAuthenticated ? "/dashboard" : "/login");
    }
  }, [loading, isAuthenticated, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-primary">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400 text-sm tracking-wide">Loading...</p>
      </div>
    </div>
  );
}
