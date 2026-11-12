"use client";

import { useEffect, useState } from "react";
import API from "@/lib/axios";

interface ReportData {
  summary: { tasks: number; openTasks: number; completedTasks: number; tickets: number; openTickets: number; resolvedTickets: number; members: number; activeMembers: number };
  departments: { department: string; tasks: number; completedTasks: number; tickets: number; resolvedTickets: number }[];
}

export default function WorkspaceReports() {
  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const response = await API.get<{ success: boolean; data: ReportData; message?: string }>("/reports", { signal });
      setReport(response.data.data);
    } catch (requestError) {
      if (signal?.aborted) return;
      setError((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not load reports.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const summary = report?.summary;
  return (
    <div className="space-y-5">
      <div><h1 className="dashboard-page-title">Reports</h1><p className="dashboard-page-subtitle">Workspace workload and completion totals from current records.</p></div>
      {error ? <div className="rounded-xl border border-red-500/30 p-4 text-sm text-red-500" role="alert">{error} <button className="ml-2 underline" onClick={() => void load()} type="button">Retry</button></div> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[{ label: "Total tasks", value: summary?.tasks }, { label: "Open tasks", value: summary?.openTasks }, { label: "Completed tasks", value: summary?.completedTasks }, { label: "Task completion", value: summary?.tasks ? `${Math.round((summary.completedTasks / summary.tasks) * 100)}%` : "0%" }, { label: "Total tickets", value: summary?.tickets }, { label: "Open tickets", value: summary?.openTickets }, { label: "Resolved tickets", value: summary?.resolvedTickets }, { label: "Active members", value: summary ? `${summary.activeMembers} / ${summary.members}` : undefined }].map((stat) => <div className="rounded-xl border t-border-subtle t-bg-card p-4" key={stat.label}><p className="text-xs t-text-muted">{stat.label}</p><p className="mt-1 text-2xl font-bold t-text-primary">{loading ? "—" : stat.value}</p></div>)}
          </div>
          <section className="overflow-x-auto rounded-xl border t-border-subtle t-bg-card">
            <h2 className="px-4 py-4 text-lg font-semibold t-text-primary">Department breakdown</h2>
            <table className="w-full min-w-[680px] text-left text-sm"><thead className="border-y t-border-subtle text-xs uppercase t-text-muted"><tr>{["Department", "Tasks", "Completed tasks", "Tickets", "Resolved tickets"].map((label) => <th className="px-4 py-3 font-semibold" key={label}>{label}</th>)}</tr></thead>
              <tbody className="divide-y t-border-subtle">{(report?.departments || []).map((row) => <tr className="t-text-primary" key={row.department}><td className="px-4 py-4 font-semibold">{row.department}</td><td className="px-4 py-4">{row.tasks}</td><td className="px-4 py-4">{row.completedTasks}</td><td className="px-4 py-4">{row.tickets}</td><td className="px-4 py-4">{row.resolvedTickets}</td></tr>)}{!loading && !report?.departments.length && <tr><td className="px-4 py-8 text-center t-text-muted" colSpan={5}>No task or ticket records yet.</td></tr>}</tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
