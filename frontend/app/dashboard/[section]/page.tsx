"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/rbac";
import { navigationItems } from "@/lib/navConfig";
import { usePathname } from "next/navigation";
import WorkItemCreateActions from "@/components/WorkItemCreateActions";
import DeadlineRequests from "@/components/DeadlineRequests";
import WorkItemsTable from "@/components/WorkItemsTable";
import DashboardDirectory from "@/components/DashboardDirectory";

export default function DashboardSectionPage() {
  const { user } = useAuth();
  const pathname = usePathname();
  const item = navigationItems.find((entry) => entry.href === pathname);
  const permitted =
    !!user &&
    !!item &&
    item.allowedPositions.includes(user.position) &&
    can(user, item.permission);

  return (
    <ProtectedRoute>
      {permitted ? (
        <section className="dashboard-placeholder">
          {item.href === "/dashboard/all-tasks" || item.href === "/dashboard/all-tickets" ? (
            <>
              <div className="dashboard-page-header">
                <div>
                  <h1 className="dashboard-page-title">{item.href.endsWith("all-tasks") ? "All Tasks" : "All Tickets"}</h1>
                  <p className="dashboard-page-subtitle">{user?.name} · {user?.department} · {user?.position.toLowerCase().replaceAll("_", " ")}</p>
                </div>
              </div>
              <WorkItemsTable fixedView={item.href.endsWith("all-tasks") ? "tasks" : "tickets"} />
            </>
          ) : item.href === "/dashboard/teams" || item.href === "/dashboard/members" ? (
            <DashboardDirectory mode={item.href.endsWith("teams") ? "teams" : "members"} />
          ) : item.href === "/dashboard/create-task" ? (
            <>
              <h1 className="dashboard-page-title">Create task</h1>
              <p className="dashboard-page-subtitle">
                Create a task and assign it to a member in your permitted scope.
              </p>
              <div className="dashboard-create-route-action">
                <WorkItemCreateActions initialDialog="task" />
              </div>
            </>
          ) : item.href === "/dashboard/deadline-requests" ? (
            <DeadlineRequests />
          ) : (
            <>
              <h1 className="dashboard-page-title">{item.label}</h1>
              <p className="dashboard-page-subtitle">
                This section is coming soon.
              </p>
            </>
          )}
        </section>
      ) : (
        <section className="dashboard-placeholder" role="alert">
          <h1 className="dashboard-page-title">403 · Access denied</h1>
          <p className="dashboard-page-subtitle">
            You do not have permission to access this section.
          </p>
        </section>
      )}
    </ProtectedRoute>
  );
}
