"use client";

import WorkItemsTable from "@/components/WorkItemsTable";
import WorkItemCreateActions from "@/components/WorkItemCreateActions";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { user } = useAuth();
  const isIndividual = user?.position === "EMPLOYEE" || user?.position === "INTERN";
  const isManager = user?.position === "MANAGER";
  const dashboardHint = isIndividual
    ? "Your tasks and tickets, with the newest items shown first. Click a column heading to change the order."
    : isManager
      ? "Review work across departments. Use the status tabs or filters to narrow the list, or click a column heading to sort."
      : "Review tasks and tickets assigned to your team. Use the status tabs to narrow the list, or click a column heading to sort.";

  return (
    <ProtectedRoute>
      <section className="dashboard-page">
        <div className="dashboard-page-header">
          <div>
            <h1 className="dashboard-page-title">
              {isIndividual
                ? "My Tasks & Tickets"
                : isManager
                  ? "All Tasks & Tickets"
                  : "Team Tasks & Tickets"}
            </h1>
            <p className="dashboard-page-subtitle">
              {dashboardHint}
            </p>
          </div>
          <WorkItemCreateActions />
        </div>
        <WorkItemsTable />
      </section>
    </ProtectedRoute>
  );
}
