"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import SkeletonLoader from "@/components/SkeletonLoader";
import TaskFilters, { type FilterState } from "@/components/TaskFilters";
import TaskTimeline from "@/components/TaskTimeline";
import CompleteTaskModal from "@/components/CompleteTaskModal";
import { TaskProgressControl } from "@/components/TaskProgress";
import { useAuth } from "@/context/AuthContext";

interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  progress: number;
  priority: string;
  dueDate: string;
  completedBy?: string;
  completedAt?: string;
  project?: { id: number; title: string; description?: string };
  assignee?: { id: number; name: string; email: string };
}
  
const isOverdue = (task: Task) =>
  task.status !== "Completed" && task.status !== "DONE" && new Date(task.dueDate) < new Date(new Date().toDateString());

const statusStyle: Record<string, string> = {
  Pending: "bg-amber-500/15 text-amber-500 border-amber-500/20",
  "In-Progress": "bg-blue-500/15 text-blue-500 border-blue-500/20",
  Completed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
};

const priorityStyle: Record<string, string> = {
  Low: "bg-gray-500/15 text-gray-500 border-gray-500/20",
  Medium: "bg-blue-500/15 text-blue-500 border-blue-500/20",
  High: "bg-orange-500/15 text-orange-500 border-orange-500/20",
  Urgent: "bg-red-500/15 text-red-500 border-red-500/20",
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  statuses: [],
  priorities: [],
  sortBy: "createdAt",
  sortOrder: "DESC",
  overdue: false,
};

export default function MemberDashboard() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, inProgress: 0, overdue: 0 });
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [filtersReady, setFiltersReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [timelineTaskId, setTimelineTaskId] = useState<number | null>(null);
  const [progressUpdatingId, setProgressUpdatingId] = useState<number | null>(null);

  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [completingSubmitting, setCompletingSubmitting] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("assignedToMe", "true");
      params.set("page", String(page));
      params.set("pageSize", "10");
      if (filters.search) params.set("search", filters.search);
      if (filters.statuses.length > 0) params.set("status", filters.statuses.join(","));
      if (filters.priorities.length > 0) params.set("priority", filters.priorities.join(","));
      if (filters.overdue) params.set("overdue", "true");
      params.set("sortBy", filters.sortBy);
      params.set("sortOrder", filters.sortOrder);

      const [{ data }, summaryResponse] = await Promise.all([
        API.get(`/tasks?${params.toString()}`),
        API.get("/tasks/dashboard-summary", { params: { assignedToMe: "true" } }),
      ]);
      setTasks(data.data.tasks || []);
      setPageCount(Math.max(1, data.data.pageCount || 1));
      if (page > Math.max(1, data.data.pageCount || 1)) setPage(Math.max(1, data.data.pageCount || 1));
      setSummary(summaryResponse.data.data.summary);
    } catch {
      toast.error("Failed to fetch your tasks.");
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const status = params.get("myStatus") || "";
      const priority = params.get("myPriority") || "";
      const sortBy = params.get("mySortBy") || "createdAt";
      const sortOrder = params.get("mySortOrder") || "DESC";
      const rawPage = Number(params.get("myPage") || 1);
      setFilters({
        search: params.get("mySearch") || "",
        statuses: ["Pending", "In-Progress", "Completed"].includes(status) ? [status] : [],
        priorities: ["Low", "Medium", "High", "Urgent"].includes(priority) ? [priority] : [],
        sortBy: ["createdAt", "dueDate", "priority", "status"].includes(sortBy) ? sortBy : "createdAt",
        sortOrder: sortOrder === "ASC" ? "ASC" : "DESC",
        overdue: params.get("myOverdue") === "true",
      });
      setPage(Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1);
      setFiltersReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    const params = new URLSearchParams(window.location.search);
    const values: Record<string, string> = {
      mySearch: filters.search.trim(),
      myStatus: filters.statuses[0] || "",
      myPriority: filters.priorities[0] || "",
      myOverdue: filters.overdue ? "true" : "",
      mySortBy: filters.sortBy !== "createdAt" ? filters.sortBy : "",
      mySortOrder: filters.sortOrder !== "DESC" ? filters.sortOrder : "",
      myPage: page > 1 ? String(page) : "",
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [filtersReady, filters, page]);

  useEffect(() => {
    if (!filtersReady) return;
    const timer = window.setTimeout(() => void fetchTasks(), filters.search ? 200 : 0);
    return () => window.clearTimeout(timer);
  }, [fetchTasks, filtersReady, filters.search]);

  const updateFilters = (next: FilterState) => {
    setFilters(next);
    setPage(1);
  };

  const handleStatusUpdate = async (taskId: number, newStatus: string) => {
    if (newStatus === "Completed") {
      const task = tasks.find((t) => t.id === taskId);
      if (task) setCompletingTask(task);
      return;
    }
    try {
      setUpdatingId(taskId);
      const { data } = await API.put(`/tasks/${taskId}/status`, { status: newStatus });
      if (data.success) {
        toast.success(`Status updated to "${newStatus}"`);
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus, progress: newStatus === "Pending" || t.status === "Completed" ? 0 : t.progress } : t)));
        void fetchTasks();
      }
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to update status.");
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCompleteConfirm = async ({ completedBy, completedAt }: { completedBy: string; completedAt: string }) => {
    if (!completingTask) return;
    try {
      setCompletingSubmitting(true);
      const { data } = await API.put(`/tasks/${completingTask.id}/status`, {
        status: "Completed",
        completedBy,
        completedAt,
      });
      if (data.success) {
        toast.success(`Task "${completingTask.title}" marked as completed!`);
        setTasks((prev) => prev.map((t) => t.id === completingTask.id ? { ...t, status: "Completed", progress: 100, completedBy, completedAt } : t));
        setCompletingTask(null);
        void fetchTasks();
      }
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } }).response?.data?.message || "Failed to complete task.");
    } finally {
      setCompletingSubmitting(false);
    }
  };

  const handleProgressUpdate = async (taskId: number, progress: number) => {
    try {
      setProgressUpdatingId(taskId);
      const { data } = await API.put(`/tasks/${taskId}/progress`, { progress });
      if (!data.success) throw new Error(data.message || "Progress was not saved.");
      setTasks((previous) => previous.map((task) => task.id === taskId ? { ...task, progress: data.data.task.progress, status: data.data.task.status } : task));
      toast.success("Task progress saved.");
      void fetchTasks();
      return true;
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message ||
        (err as { message?: string }).message || "Failed to update task progress.";
      toast.error(message);
      return false;
    } finally {
      setProgressUpdatingId(null);
    }
  };

  const overdueCount = summary.overdue;

  if (loading && tasks.length === 0) return <SkeletonLoader count={4} />;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Stats ─────────────────────────────────────────────────────────── */}

     {/* Stats */}
<div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
  {[
    {
      label: "Total",
      value: summary.total,
      color: "from-indigo-500 to-indigo-700",
      icon: "📊",
    },
    {
      label: "Pending",
      value: summary.pending,
      color: "from-amber-500 to-amber-700",
      icon: "⏳",
    },
    {
      label: "In Progress",
      value: summary.inProgress,
      color: "from-blue-500 to-blue-700",
      icon: "🔄",
    },
    {
      label: "Overdue",
      value: overdueCount,
      color: "from-red-500 to-red-700",
      icon: "⚠",
    },
  ].map((s) => (
    <div
      key={s.label}
      className="rounded-2xl p-4 flex items-center gap-3 border border-gray-200 bg-white transition-colors light-shadow"
    >
      <div
        className={`w-10 h-10 rounded-xl bg-linear-to-br ${s.color} flex items-center justify-center text-white font-bold shadow-lg text-sm`}
      >
        {s.icon}
      </div>

      <div>
        <p className="text-lg font-bold text-slate-900">{s.value}</p>
        <p className="text-xs text-slate-600">{s.label}</p>
      </div>
    </div>
  ))}
</div>

      {overdueCount > 0 && (
        <div className="rounded-xl px-5 py-3 text-sm font-bold bg-red-500/10 text-red-500 border border-red-500/20 animate-pulse">
          ⚠ You have {overdueCount} overdue tasks that need attention.
        </div>
      )}

      {/* ── Task Filters ──────────────────────────────────────────────────── */}
      <TaskFilters filters={filters} onChange={updateFilters} taskCount={summary.total} />

      {/* ── Tasks Table ────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-bold text-black mb-4">My Assigned Tasks</h2>
        {tasks.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
  <p className="text-4xl mb-3">📋</p>
  <p className="text-slate-600 text-sm">
    {summary.total > 0 ? "No tasks match the selected filters." : "No tasks assigned to you yet."}
  </p>
</div>
        ) : (
          <div className="rounded-2xl border t-border-subtle t-bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-200">
                <thead>
                  <tr className="border-b t-border-subtle t-text-muted text-[11px] uppercase tracking-wider font-bold bg-zinc-500/5">
                    <th className="px-6 py-4">ID</th>
                    <th className="px-6 py-4">Task Details</th>
                    <th className="px-6 py-4">Project</th>
                    <th className="px-6 py-4">Priority</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Progress</th>
                    <th className="px-6 py-4">Due Date</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y t-border-subtle">
                  {tasks.map((t) => {
                    const overdue = isOverdue(t);
                    return (
                      <tr key={t.id} className={`group transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${overdue ? "bg-red-500/5" : ""}`}>
                        <td className="px-6 py-4 text-xs font-mono t-text-muted">#{t.id}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <button type="button" onClick={() => setTimelineTaskId(t.id)} className={`text-left font-bold text-sm hover:underline ${overdue ? "text-red-500" : "t-text-primary"}`}>{t.title}</button>
                            {t.description && <span className="text-[11px] t-text-muted line-clamp-1">{t.description}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs t-text-secondary">{t.project?.title || "—"}</td>
                        <td className="px-6 py-4">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${priorityStyle[t.priority]}`}>{t.priority}</span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            {t.status !== "Completed" ? (
                              <select 
                                value={t.status} 
                                onChange={(e) => handleStatusUpdate(t.id, e.target.value)} 
                                disabled={updatingId === t.id}
                                className={`text-[10px] px-2 py-1 rounded-md border font-bold bg-transparent outline-none cursor-pointer ${statusStyle[t.status]}`}
                              >
                                {["Pending", "In-Progress", "Completed"].map(s => <option key={s} value={s} className="bg-white dark:bg-zinc-900 text-black dark:text-white">{s}</option>)}
                              </select>
                            ) : (
                              <span className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${statusStyle[t.status]}`}>Completed</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <TaskProgressControl progress={t.status === "Completed" ? 100 : t.progress || 0} status={t.status}
                            disabled={progressUpdatingId === t.id} onSave={(progress) => handleProgressUpdate(t.id, progress)} size={42} />
                        </td>
                        <td className="px-6 py-4">
                          <div className={`flex flex-col ${overdue ? "text-red-500" : "t-text-muted"}`}>
                            <span className="text-xs font-medium">{t.dueDate}</span>
                            {overdue && <span className="text-[9px] font-bold uppercase">Overdue</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => setTimelineTaskId(t.id)} className="p-2 rounded-lg hover:bg-brand-500/10 text-brand-500 transition-colors">📜</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {summary.total > 0 && (
          <div className="mt-4 flex items-center justify-between gap-4 text-sm t-text-muted">
            <span>Page {page} of {pageCount}</span>
            <div className="flex items-center gap-2">
              <button type="button" className="rounded-lg border t-border-subtle px-3 py-2 disabled:opacity-50" disabled={page === 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</button>
              <button type="button" className="rounded-lg border t-border-subtle px-3 py-2 disabled:opacity-50" disabled={page >= pageCount || loading} onClick={() => setPage((current) => current + 1)}>Next</button>
            </div>
          </div>
        )}
      </section>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {completingTask && <CompleteTaskModal taskId={completingTask.id} taskTitle={completingTask.title} currentUserName={user?.name || ""} onConfirm={handleCompleteConfirm} onCancel={() => setCompletingTask(null)} submitting={completingSubmitting} />}
      {timelineTaskId && <TaskTimeline taskId={timelineTaskId} onClose={() => setTimelineTaskId(null)} />}
    </div>
  );
}
