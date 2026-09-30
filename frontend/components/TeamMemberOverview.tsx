"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import SkeletonLoader from "@/components/SkeletonLoader";
import TaskTimeline from "@/components/TaskTimeline";
import { TaskProgressCircle, TaskProgressControl } from "@/components/TaskProgress";

interface Member {
  id: number;
  name: string;
  email: string;
  createdAt?: string;
}
interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  progress: number;
  dueDate: string;
  completedAt?: string | null;
  createdAt: string;
  project?: { id: number; title: string };
}
interface Overview {
  member: Member;
  summary: { total: number; completed: number; inProgress: number; pending: number; overdue: number; completionRate: number };
  tasks: Task[];
  taskCount: number;
  page: number;
  pageCount: number;
  projects: { id: number; title: string }[];
  activity: {
    id: number; taskId: number; field: string; oldValue: string | null; newValue: string | null;
    action: string; createdAt: string; changedBy: number | null;
    changedByUser?: { id: number; name: string } | null;
    task?: { id: number; title: string };
  }[];
  activityLimited: boolean;
  historicalActivityAvailable: boolean;
}

const statusStyle: Record<string, string> = {
  Pending: "bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-500/20",
  "In-Progress": "bg-blue-500/10 text-blue-600 dark:text-blue-300 border-blue-500/20",
  Completed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-500/20",
};
const priorityStyle: Record<string, string> = {
  Low: "bg-slate-500/10 text-slate-600 dark:text-slate-300",
  Medium: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  High: "bg-orange-500/10 text-orange-600 dark:text-orange-300",
  Urgent: "bg-red-500/10 text-red-600 dark:text-red-300",
};
const today = new Date().toISOString().slice(0, 10);
const overdue = (task: Task) => task.status !== "Completed" && task.dueDate < today;

export default function TeamMemberOverview() {
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Member | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ startDate: "", endDate: "", projectId: "", status: "", priority: "" });
  const [page, setPage] = useState(1);
  const [timelineTaskId, setTimelineTaskId] = useState<number | null>(null);
  const searchRequest = useRef(0);
  const overviewRequest = useRef(0);

  useEffect(() => {
    const request = ++searchRequest.current;
    const timer = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const { data } = await API.get("/users/team-overview/search", { params: { q: search.trim() } });
        if (request === searchRequest.current) setMembers(data.data.members || []);
      } catch {
        if (request === searchRequest.current) toast.error("Could not search team members.");
      } finally {
        if (request === searchRequest.current) setSearchLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const fetchOverview = useCallback(async () => {
    if (!selected) return;
    const request = ++overviewRequest.current;
    setLoading(true);
    setError("");
    const params: Record<string, string | number> = { page, pageSize: 10 };
    for (const [key, value] of Object.entries(filters)) if (value) params[key] = value;
    try {
      const { data } = await API.get(`/users/${selected.id}/overview`, { params });
      if (request === overviewRequest.current) setOverview(data.data);
    } catch (err) {
      if (request === overviewRequest.current) {
        setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not load this member overview.");
        setOverview(null);
      }
    } finally {
      if (request === overviewRequest.current) setLoading(false);
    }
  }, [selected, filters, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchOverview]);
  const chooseMember = (member: Member) => {
    setSelected(member);
    setPage(1);
    setOverview(null);
    setLoading(true);
  };
  const changeFilter = (key: keyof typeof filters, value: string) => {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  };
  const updateProgress = async (taskId: number, progress: number) => {
    try {
      await API.put(`/tasks/${taskId}/progress`, { progress });
      toast.success("Task progress saved.");
      await fetchOverview();
      return true;
    } catch (err) {
      toast.error((err as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not update task progress.");
      return false;
    }
  };

  return (
    <section className="space-y-6" aria-labelledby="team-overview-title">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">Administration / People</p>
        <h2 id="team-overview-title" className="mt-1 text-2xl font-bold t-text-primary">Team Member Overview</h2>
        <p className="mt-1 text-sm t-text-muted">Search by name or email, then review assigned work and activity.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(250px,320px)_minmax(0,1fr)]">
        <aside className="rounded-2xl border t-border-subtle t-bg-card p-4">
          <label className="block text-sm font-semibold t-text-primary" htmlFor="member-search">Find a team member</label>
          <input id="member-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Name or email" className="mt-2 w-full rounded-xl border t-border-subtle bg-transparent px-3 py-2.5 text-sm t-text-primary outline-none focus:ring-2 focus:ring-indigo-500" />
          <div className="mt-3 flex items-center justify-between text-xs t-text-muted">
            <span>{searchLoading ? "Searching…" : `${members.length} matching members`}</span>
            {search.trim() && <button type="button" className="text-indigo-600" onClick={() => setSearch("")}>Clear</button>}
          </div>
          <div className="mt-3 space-y-2" aria-live="polite">
            {searchLoading && !members.length ? <div className="space-y-2"><div className="h-16 animate-pulse rounded-xl bg-slate-500/10" /><div className="h-16 animate-pulse rounded-xl bg-slate-500/10" /></div> :
              !members.length ? <p className="rounded-xl bg-slate-500/5 p-4 text-sm t-text-muted">{search.trim() ? "No members match that name or email." : "No active members are available."}</p> :
                members.map((member) => <button key={member.id} type="button" onClick={() => chooseMember(member)}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${selected?.id === member.id ? "border-indigo-500 bg-indigo-500/5" : "t-border-subtle hover:bg-slate-500/5"}`}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-indigo-600/10 text-sm font-bold text-indigo-700">{member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold t-text-primary">{member.name}</span><span className="block truncate text-xs t-text-muted">{member.email}</span><span className="block text-[11px] t-text-muted">Member ID: {member.id}</span></span>
                </button>)}
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          {!selected ? <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed t-border-subtle p-8 text-center"><div><span className="text-3xl" aria-hidden="true">👥</span><h3 className="mt-3 font-semibold t-text-primary">Select a team member</h3><p className="mt-1 text-sm t-text-muted">Their task summary and activity will appear here.</p></div></div> :
            loading && !overview ? <SkeletonLoader count={4} /> :
              error ? <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/5 p-5 text-sm text-red-700">{error}<button type="button" className="ml-3 font-semibold underline" onClick={() => void fetchOverview()}>Retry</button></div> :
                overview && <>
                  <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border t-border-subtle t-bg-card p-5">
                    <div className="flex min-w-0 items-center gap-4">
                      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-indigo-600 text-lg font-bold text-white">{overview.member.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</span>
                      <div className="min-w-0"><h3 className="truncate text-lg font-bold t-text-primary">{overview.member.name}</h3><p className="truncate text-sm t-text-muted">{overview.member.email}</p><p className="text-xs t-text-muted">Member ID: {overview.member.id} · Team information unavailable</p></div>
                    </div>
                    <div className="flex items-center gap-3 text-sm t-text-muted"><TaskProgressCircle progress={overview.summary.completionRate} size={64} label="Member task completion" /><span>Overall completion</span></div>
                  </header>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                    {[["Total assigned", overview.summary.total], ["Completed", overview.summary.completed], ["In progress", overview.summary.inProgress], ["Pending", overview.summary.pending], ["Overdue", overview.summary.overdue]].map(([label, value]) =>
                      <div key={label} className="rounded-xl border t-border-subtle t-bg-card p-4"><p className="text-xs t-text-muted">{label}</p><p className="mt-1 text-2xl font-bold t-text-primary">{value}</p></div>)}
                  </div>
                  <div className="rounded-2xl border t-border-subtle t-bg-card p-4">
                    <div className="mb-3"><h3 className="font-semibold t-text-primary">Filter assigned tasks</h3><p className="text-xs t-text-muted">Date range means the date the task was created and assigned.</p></div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                      <label className="text-xs font-medium t-text-muted">Assigned from<input type="date" value={filters.startDate} onChange={(event) => changeFilter("startDate", event.target.value)} className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent p-2 text-sm t-text-primary" /></label>
                      <label className="text-xs font-medium t-text-muted">Assigned through<input type="date" value={filters.endDate} onChange={(event) => changeFilter("endDate", event.target.value)} className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent p-2 text-sm t-text-primary" /></label>
                      <label className="text-xs font-medium t-text-muted">Project<select value={filters.projectId} onChange={(event) => changeFilter("projectId", event.target.value)} className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent p-2 text-sm t-text-primary"><option value="">All projects</option>{overview.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
                      <label className="text-xs font-medium t-text-muted">Status<select value={filters.status} onChange={(event) => changeFilter("status", event.target.value)} className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent p-2 text-sm t-text-primary"><option value="">All statuses</option>{["Pending", "In-Progress", "Completed"].map((status) => <option key={status}>{status}</option>)}</select></label>
                      <label className="text-xs font-medium t-text-muted">Priority<select value={filters.priority} onChange={(event) => changeFilter("priority", event.target.value)} className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent p-2 text-sm t-text-primary"><option value="">All priorities</option>{["Low", "Medium", "High", "Urgent"].map((priority) => <option key={priority}>{priority}</option>)}</select></label>
                    </div>
                  </div>
                  <div className="overflow-hidden rounded-2xl border t-border-subtle t-bg-card">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b t-border-subtle p-4"><div><h3 className="font-semibold t-text-primary">Assigned tasks</h3><p className="text-xs t-text-muted">{overview.taskCount} tasks match these filters</p></div>{loading && <span className="text-xs t-text-muted">Updating…</span>}</div>
                    {!overview.tasks.length ? <div className="p-10 text-center"><p className="font-semibold t-text-primary">No tasks match these filters</p><p className="mt-1 text-sm t-text-muted">Try another date range or clear a filter.</p></div> :
                      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="bg-slate-500/5 text-xs uppercase tracking-wide t-text-muted"><tr>{["Task", "Project", "Priority", "Status", "Progress", "Assigned", "Deadline", "Completed"].map((label) => <th key={label} className="px-4 py-3 font-semibold">{label}</th>)}</tr></thead>
                        <tbody className="divide-y t-border-subtle">{overview.tasks.map((task) => <tr key={task.id} className={overdue(task) ? "bg-red-500/5" : ""}>
                          <td className="px-4 py-3"><button type="button" onClick={() => setTimelineTaskId(task.id)} className="font-semibold text-indigo-700 hover:underline">{task.title}</button>{overdue(task) && <span className="ml-2 text-xs font-semibold text-red-700">Overdue</span>}</td>
                          <td className="px-4 py-3 t-text-muted">{task.project?.title || "—"}</td>
                          <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${priorityStyle[task.priority] || ""}`}>{task.priority}</span></td>
                          <td className="px-4 py-3"><span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusStyle[task.status] || ""}`}>{task.status}</span></td>
                          <td className="px-4 py-3"><TaskProgressControl progress={task.status === "Completed" ? 100 : task.progress || 0} status={task.status} onSave={(progress) => updateProgress(task.id, progress)} size={42} /></td>
                          <td className="px-4 py-3 text-xs t-text-muted">{new Date(task.createdAt).toLocaleDateString()}</td>
                          <td className={`px-4 py-3 text-xs ${overdue(task) ? "font-semibold text-red-700" : "t-text-muted"}`}>{task.dueDate}</td>
                          <td className="px-4 py-3 text-xs t-text-muted">{task.completedAt || "—"}</td>
                        </tr>)}</tbody>
                      </table></div>}
                    <footer className="flex items-center justify-between border-t t-border-subtle p-3 text-sm"><span className="t-text-muted">Page {overview.page} of {overview.pageCount}</span><div className="flex gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} className="rounded-lg border t-border-subtle px-3 py-1.5 disabled:opacity-50">Previous</button><button type="button" disabled={page >= overview.pageCount || loading} onClick={() => setPage((current) => current + 1)} className="rounded-lg border t-border-subtle px-3 py-1.5 disabled:opacity-50">Next</button></div></footer>
                  </div>
                  <section className="rounded-2xl border t-border-subtle t-bg-card p-5">
                    <div className="mb-4"><h3 className="font-semibold t-text-primary">Work and activity history</h3><p className="text-xs t-text-muted">Recent recorded events on tasks matching the current filters. Actor labels distinguish the member from others.</p></div>
                    {!overview.historicalActivityAvailable ? <p className="rounded-xl bg-slate-500/5 p-4 text-sm t-text-muted">No historical activity is available for these tasks. Only actions recorded from the history-tracking rollout onward can be shown.</p> :
                      <ol className="space-y-3">{overview.activity.map((entry) => {
                        const memberActor = entry.changedBy === overview.member.id;
                        const label = entry.field === "progress" ? `Progress changed from ${entry.oldValue}% to ${entry.newValue}%` : entry.action === "status_changed" ? `Status changed from ${entry.oldValue} to ${entry.newValue}` : entry.action === "created" ? "Task created" : `${entry.field} updated`;
                        const actorLabel = entry.changedBy === null ? "System change" : memberActor ? "Action by member" : `Change by ${entry.changedByUser?.name || "another user"}`;
                        return <li key={entry.id} className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-500" /><div className="min-w-0 flex-1"><p className="text-sm t-text-primary">{label}</p><p className="mt-1 text-xs t-text-muted">{actorLabel} · {new Date(entry.createdAt).toLocaleString()}</p></div>{entry.task && <button type="button" onClick={() => setTimelineTaskId(entry.taskId)} className="max-w-40 truncate text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-300" aria-label={`Open task ${entry.task.title}`}>{entry.task.title}</button>}</li>;
                      })}</ol>}
                    {overview.activityLimited && <p className="mt-3 text-xs t-text-muted">Showing the 50 most recent recorded events.</p>}
                  </section>
                </>}
        </div>
      </div>
      {timelineTaskId !== null && <TaskTimeline taskId={timelineTaskId} onClose={() => setTimelineTaskId(null)} />}
    </section>
  );
}
