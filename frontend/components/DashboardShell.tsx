"use client";

import { useState, type ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import { useTheme } from "@/context/ThemeContext";

export default function DashboardShell({ children }: { children: ReactNode }) {
  const { isDark, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="dashboard-shell">
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="dashboard-shell-content">
        <header className="dashboard-topbar">
          <button
            type="button"
            className="dashboard-menu-button dashboard-mobile-menu"
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            ☰
          </button>
          <button
            type="button"
            className="dashboard-menu-button dashboard-collapse-button"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-pressed={collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? "»" : "«"}
          </button>
          <span className="dashboard-topbar-title">Workspace</span>
          <button
            type="button"
            className="dashboard-theme-button"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {isDark ? "Light theme" : "Dark theme"}
          </button>
        </header>
        <main className="dashboard-main">{children}</main>
      </div>
    </div>
  );
}
