"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import API from "@/lib/axios";

interface Member {
  id: number;
  name: string;
  email: string;
  department: string;
  position: string;
  employeeId: string;
  isActive: boolean;
  status: string;
  joinedAt: string;
  lastActivityAt: string | null;
  reportsTo?: { id: number; name: string; position: string } | null;
}

interface Team {
  department: string;
  memberCount: number;
  activeMemberCount: number;
  openTasks: number;
  completedTasks: number;
  leads: { id: number; name: string; position: string }[];
}

interface DirectoryResponse {
  success: boolean;
  data: { members: Member[]; teams: Team[] };
  message?: string;
}

function dateLabel(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString();
}

export default function DashboardDirectory({ mode }: { mode: "teams" | "members" }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    API.get<DirectoryResponse>("/users/directory", { signal: controller.signal })
      .then(({ data }) => {
        setMembers(data.data.members || []);
        setTeams(data.data.teams || []);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        const message = (requestError as { response?: { data?: { message?: string } } }).response?.data?.message;
        setError(message || "Could not load directory data. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return members;
    return members.filter((member) => [member.name, member.email, member.employeeId, member.department, member.position, member.reportsTo?.name]
      .some((value) => value?.toLocaleLowerCase().includes(query)));
  }, [members, search]);
  const filteredTeams = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return teams;
    return teams.filter((team) => [team.department, ...team.leads.map((lead) => lead.name)]
      .some((value) => value.toLocaleLowerCase().includes(query)));
  }, [teams, search]);

  const title = mode === "teams" ? "All Teams" : "Members";
  const total = mode === "teams" ? teams.length : members.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="dashboard-page-title">{title}</h1>
          <p className="dashboard-page-subtitle">{mode === "teams" ? "Departments, team leads, and assigned work" : "Workspace member directory"}</p>
        </div>
        <label className="text-sm t-text-muted">
          <span className="sr-only">Search {title.toLowerCase()}</span>
          <input className="w-72 max-w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 t-text-primary" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={mode === "teams" ? "Search departments or leads…" : "Search name, email, or department…"} />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[{ label: "Departments", value: teams.length }, { label: "Members", value: members.length }, { label: "Active members", value: members.filter((member) => member.isActive && member.status === "ACTIVE").length }].map((stat) => (
          <div key={stat.label} className="rounded-xl border t-border-subtle t-bg-card p-4">
            <p className="text-xs t-text-muted">{stat.label}</p><p className="mt-1 text-2xl font-bold t-text-primary">{loading ? "—" : stat.value}</p>
          </div>
        ))}
      </div>

      {error && <div className="rounded-xl border border-red-500/30 p-4 text-sm text-red-500" role="alert">{error} <button className="ml-2 underline" type="button" onClick={() => window.location.reload()}>Retry</button></div>}
      {loading ? <p className="p-6 text-sm t-text-muted" role="status">Loading {title.toLowerCase()}…</p> : mode === "teams" ? (
        <div className="overflow-x-auto rounded-xl border t-border-subtle t-bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b t-border-subtle text-xs uppercase t-text-muted"><tr>{["Department", "Members", "Team leads", "Open tasks", "Completed tasks"].map((label) => <th className="px-4 py-3 font-semibold" key={label}>{label}</th>)}</tr></thead>
            <tbody className="divide-y t-border-subtle">
              {filteredTeams.map((team) => <tr key={team.department} className="t-text-primary">
                <td className="px-4 py-4 font-semibold">{team.department}</td>
                <td className="px-4 py-4">{team.activeMemberCount} active <span className="t-text-muted">/ {team.memberCount} total</span></td>
                <td className="px-4 py-4">{team.leads.length ? team.leads.map((lead) => <span className="mr-2 inline-block" key={lead.id}>{lead.name}</span>) : <span className="t-text-muted">No active lead</span>}</td>
                <td className="px-4 py-4">{team.openTasks}</td><td className="px-4 py-4">{team.completedTasks}</td>
              </tr>)}
              {!filteredTeams.length && <tr><td className="px-4 py-8 text-center t-text-muted" colSpan={5}>No departments match this search.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border t-border-subtle t-bg-card">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b t-border-subtle text-xs uppercase t-text-muted"><tr>{["Member", "Employee ID", "Department", "Position", "Reports to", "Status", "Last activity", ""].map((label) => <th className="px-4 py-3 font-semibold" key={label || "open"}>{label}</th>)}</tr></thead>
            <tbody className="divide-y t-border-subtle">
              {filteredMembers.map((member) => <tr key={member.id} className="t-text-primary">
                <td className="px-4 py-4"><span className="block font-semibold">{member.name}</span><span className="text-xs t-text-muted">{member.email}</span></td>
                <td className="px-4 py-4">{member.employeeId}</td><td className="px-4 py-4">{member.department}</td><td className="px-4 py-4">{member.position.replaceAll("_", " ")}</td>
                <td className="px-4 py-4">{member.reportsTo?.name || "—"}</td>
                <td className="px-4 py-4"><span className={member.isActive && member.status === "ACTIVE" ? "text-emerald-500" : "text-amber-500"}>{member.isActive && member.status === "ACTIVE" ? "Active" : "Inactive"}</span></td>
                <td className="px-4 py-4">{dateLabel(member.lastActivityAt)}</td><td className="px-4 py-4"><Link className="font-semibold text-indigo-500 hover:underline" href={`/dashboard/members/${member.id}`}>View</Link></td>
              </tr>)}
              {!filteredMembers.length && <tr><td className="px-4 py-8 text-center t-text-muted" colSpan={8}>No members match this search.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {!loading && !error && <p className="text-xs t-text-muted">Showing {mode === "teams" ? filteredTeams.length : filteredMembers.length} of {total} {mode === "teams" ? "departments" : "members"}.</p>}
    </div>
  );
}
