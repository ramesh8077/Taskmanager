"use client";

import WorkItemsTable from "@/components/WorkItemsTable";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

export default function DashboardPage() {
  const { user } = useAuth();
  const isIndividual = user?.position === "EMPLOYEE" || user?.position === "INTERN";
  const isManager = user?.position === "MANAGER";
  const positionLabel = user?.position.toLowerCase().replaceAll("_", " ") || "";

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
              {user?.name} · {user?.department} · {positionLabel}
            </p>
          </div>
        </div>
        <WorkItemsTable />
      </section>
    </ProtectedRoute>
  );
}
