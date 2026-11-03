"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { can } from "@/lib/rbac";
import { navigationItems } from "@/lib/navConfig";
import { useAuth } from "@/context/AuthContext";

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onClose: () => void;
}

const positionLabel = (position: string) =>
  position.toLowerCase().replaceAll("_", " ");

export default function Sidebar({
  collapsed,
  mobileOpen,
  onClose,
}: SidebarProps) {
  const { user, logout } = useAuth();
  const pathname = usePathname();

  const visibleItems = navigationItems.filter(
    (item) =>
      user &&
      item.allowedPositions.includes(user.position) &&
      can(user, item.permission),
  );

  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="dashboard-sidebar-backdrop"
          onClick={onClose}
        />
      )}
      <aside
        aria-label="Main navigation"
        className={`dashboard-sidebar${collapsed ? " is-collapsed" : ""}${mobileOpen ? " is-mobile-open" : ""}`}
      >
        <Link href="/dashboard" className="dashboard-brand" onClick={onClose}>
          <span className="dashboard-brand-mark" aria-hidden="true">T</span>
          <span className="dashboard-brand-name">Task Manager</span>
        </Link>

        <nav className="dashboard-sidebar-nav">
          {visibleItems.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
                className={`dashboard-nav-link${active ? " is-active" : ""}`}
              >
                <span className="dashboard-nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="dashboard-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="dashboard-sidebar-user">
          <div className="dashboard-user-avatar" aria-hidden="true">
            {user?.name?.slice(0, 1).toUpperCase() || "?"}
          </div>
          <div className="dashboard-user-info">
            <p className="dashboard-user-name">{user?.name || "Account"}</p>
            <p className="dashboard-user-position">
              {user?.department} · {positionLabel(user?.position || "")}
            </p>
          </div>
          <button type="button" className="dashboard-logout" onClick={() => void logout()}>
            <span className="dashboard-nav-icon" aria-hidden="true">↪</span>
            <span className="dashboard-nav-label">Log out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
