"use client";

import { useEffect, useState } from "react";
import API from "@/lib/axios";

interface TeamMember {
  id: number;
  name: string;
  email: string;
  department: string;
  position: string;
  employeeId: string;
  reportsTo?: { id: number; name: string } | null;
  tasks: number;
  openTasks: number;
  tickets: number;
  openTickets: number;
}

interface TeamData {
  members: TeamMember[];
  summary: { members: number; tasks: number; openTasks: number; tickets: number; openTickets: number };
}

export default function TeamDirectory() {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function load(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const response = await API.get<{ success: boolean; data: TeamData; message?: string }>("/users/team", { signal });
      setData(response.data.data);
    } catch (requestError) {
      if (signal?.aborted) return;
      setError((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not load your team.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, []);

  const members = (data?.members || []).filter((member) =>
    [member.name, member.email, member.employeeId, member.department, member.position]
      .some((value) => value.toLowerCase().includes(search.trim().toLowerCase())));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="dashboard-page-title">My Team</h1><p className="dashboard-page-subtitle">People in your reporting scope and their assigned workload.</p></div>
        <input aria-label="Search team members" className="w-72 max-w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 text-sm t-text-primary" type="search" placeholder="Search team members…" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[{ label: "Team members", value: data?.summary.members }, { label: "Tasks", value: data?.summary.tasks }, { label: "Open tasks", value: data?.summary.openTasks }, { label: "Tickets", value: data?.summary.tickets }, { label: "Open tickets", value: data?.summary.openTickets }].map((stat) => <div className="rounded-xl border t-border-subtle t-bg-card p-4" key={stat.label}><p className="text-xs t-text-muted">{stat.label}</p><p className="mt-1 text-2xl font-bold t-text-primary">{loading ? "—" : stat.value}</p></div>)}
      </div>
      {error ? <div className="rounded-xl border border-red-500/30 p-4 text-sm text-red-500" role="alert">{error} <button className="ml-2 underline" onClick={() => void load()} type="button">Retry</button></div> : loading ? <p className="p-6 text-sm t-text-muted" role="status">Loading team…</p> : (
        <div className="overflow-x-auto rounded-xl border t-border-subtle t-bg-card">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="border-b t-border-subtle text-xs uppercase t-text-muted"><tr>{["Member", "Department", "Position", "Reports to", "Tasks", "Open tasks", "Tickets", "Open tickets"].map((label) => <th className="px-4 py-3 font-semibold" key={label}>{label}</th>)}</tr></thead>
            <tbody className="divide-y t-border-subtle">
              {members.map((member) => <tr className="t-text-primary" key={member.id}><td className="px-4 py-4"><strong className="block">{member.name}</strong><span className="text-xs t-text-muted">{member.email} · {member.employeeId}</span></td><td className="px-4 py-4">{member.department}</td><td className="px-4 py-4">{member.position.replaceAll("_", " ")}</td><td className="px-4 py-4">{member.reportsTo?.name || "—"}</td><td className="px-4 py-4">{member.tasks}</td><td className="px-4 py-4">{member.openTasks}</td><td className="px-4 py-4">{member.tickets}</td><td className="px-4 py-4">{member.openTickets}</td></tr>)}
              {!members.length && <tr><td className="px-4 py-8 text-center t-text-muted" colSpan={8}>{search ? "No team members match this search." : "No active members are in your reporting scope yet."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
