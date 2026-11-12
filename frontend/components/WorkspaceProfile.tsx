"use client";

import { useAuth } from "@/context/AuthContext";

export default function WorkspaceProfile() {
  const { user } = useAuth();
  const fields = [
    ["Full name", user?.name],
    ["Email", user?.email],
    ["Employee ID", user?.employeeId],
    ["Position", user?.position.replaceAll("_", " ")],
    ["Role", user?.role.replaceAll("_", " ")],
    ["Department", user?.department],
    ["Reports to ID", user?.reportsToId ? String(user.reportsToId) : "Not assigned"],
  ];
  return (
    <div className="space-y-5">
      <div><h1 className="dashboard-page-title">Profile</h1><p className="dashboard-page-subtitle">Your account information and workspace access.</p></div>
      <section className="max-w-3xl rounded-xl border t-border-subtle t-bg-card p-5">
        <div className="flex items-center gap-4 border-b t-border-subtle pb-5"><span className="grid h-14 w-14 place-items-center rounded-xl bg-indigo-500 text-xl font-bold text-white">{user?.name?.slice(0, 1).toUpperCase() || "U"}</span><div><h2 className="text-xl font-semibold t-text-primary">{user?.name}</h2><p className="text-sm t-text-muted">{user?.department} · {user?.position.toLowerCase().replaceAll("_", " ")}</p></div></div>
        <dl className="mt-5 grid gap-5 sm:grid-cols-2">{fields.map(([label, value]) => <div key={label}><dt className="text-xs t-text-muted">{label}</dt><dd className="mt-1 text-sm font-medium t-text-primary">{value || "—"}</dd></div>)}</dl>
      </section>
    </div>
  );
}
