"use client";

import { useEffect, useState } from "react";
import API from "@/lib/axios";

interface WorkspaceSettingsData {
  departments: string[];
  positions: string[];
  reportingPositions: Record<string, string[]>;
  roles: { id: number; name: string; isActive: boolean; permissions: { name: string; description: string }[] }[];
}

export default function WorkspaceSettings() {
  const [settings, setSettings] = useState<WorkspaceSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const response = await API.get<{ success: boolean; data: WorkspaceSettingsData; message?: string }>("/settings", { signal });
      setSettings(response.data.data);
    } catch (requestError) {
      if (signal?.aborted) return;
      setError((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not load workspace settings.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  return (
    <div className="space-y-5">
      <div><h1 className="dashboard-page-title">Settings</h1><p className="dashboard-page-subtitle">Workspace departments, reporting hierarchy, and database-backed role permissions.</p></div>
      {error ? <div className="rounded-xl border border-red-500/30 p-4 text-sm text-red-500" role="alert">{error} <button className="ml-2 underline" onClick={() => void load()} type="button">Retry</button></div> : loading ? <p className="p-6 text-sm t-text-muted" role="status">Loading workspace settings…</p> : settings && (
        <>
          <section className="rounded-xl border t-border-subtle t-bg-card p-5"><h2 className="text-lg font-semibold t-text-primary">Departments</h2><div className="mt-3 flex flex-wrap gap-2">{settings.departments.map((department) => <span className="rounded-full border t-border-subtle px-3 py-1 text-sm t-text-secondary" key={department}>{department}</span>)}</div></section>
          <section className="rounded-xl border t-border-subtle t-bg-card p-5"><h2 className="text-lg font-semibold t-text-primary">Reporting hierarchy</h2><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{settings.positions.map((position) => <div className="rounded-lg border t-border-subtle p-3" key={position}><p className="font-semibold t-text-primary">{position.replaceAll("_", " ")}</p><p className="mt-1 text-sm t-text-muted">May report to: {(settings.reportingPositions[position] || []).map((parent) => parent.replaceAll("_", " ")).join(", ") || "No parent role"}</p></div>)}</div></section>
          <section className="space-y-3"><h2 className="text-lg font-semibold t-text-primary">Role permissions</h2>{settings.roles.map((role) => <details className="rounded-xl border t-border-subtle t-bg-card p-4" key={role.id}><summary className="cursor-pointer font-semibold t-text-primary">{role.name.replaceAll("_", " ")} · {role.isActive ? "Active" : "Disabled"} · {role.permissions.length} permissions</summary><ul className="mt-4 grid gap-2 sm:grid-cols-2">{role.permissions.map((permission) => <li className="rounded-lg bg-slate-500/5 p-3" key={permission.name}><code className="text-xs t-text-primary">{permission.name}</code><p className="mt-1 text-xs t-text-muted">{permission.description}</p></li>)}</ul></details>)}</section>
        </>
      )}
    </div>
  );
}
