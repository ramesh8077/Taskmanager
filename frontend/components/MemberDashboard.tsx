"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import SkeletonLoader from "@/components/SkeletonLoader";
import TaskFilters, { type FilterState } from "@/components/TaskFilters";
import TaskTimeline from "@/components/TaskTimeline";
import CompleteTaskModal from "@/components/CompleteTaskModal";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate: string;
  completedBy?: string;
  completedAt?: string;
  project?: { id: number; title: string; description?: string };
  assignee?: { id: number; name: string; email: string };
}
  
const isOverdue = (task: Task) =>
  task.status !== "Completed" && new Date(task.dueDate) < new Date(new Date().toDateString());

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
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [timelineTaskId, setTimelineTaskId] = useState<number | null>(null);

  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [completingSubmitting, setCompletingSubmitting] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.statuses.length > 0) params.set("status", filters.statuses.join(","));
      if (filters.priorities.length > 0) params.set("priority", filters.priorities.join(","));
      if (filters.overdue) params.set("overdue", "true");
      params.set("sortBy", filters.sortBy);
      params.set("sortOrder", filters.sortOrder);

      const { data } = await API.get(`/tasks?${params.toString()}`);
      setTasks(data.data.tasks || []);
    } catch {
      toast.error("Failed to fetch your tasks.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

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
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status.");
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
        setTasks((prev) => prev.map((t) => t.id === completingTask.id ? { ...t, status: "Completed", completedBy, completedAt } : t));
        setCompletingTask(null);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to complete task.");
    } finally {
      setCompletingSubmitting(false);
    }
  };

  const overdueCount = tasks.filter(isOverdue).length;

  if (loading && tasks.length === 0) return <SkeletonLoader count={4} />;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: tasks.length, color: "from-indigo-500 to-indigo-700", icon: "📊" },
          { label: "Pending", value: tasks.filter(t => t.status === "Pending").length, color: "from-amber-500 to-amber-700", icon: "⏳" },
          { label: "In Progress", value: tasks.filter(t => t.status === "In-Progress").length, color: "from-blue-500 to-blue-700", icon: "🔄" },
          { label: "Overdue", value: overdueCount, color: "from-red-500 to-red-700", icon: "⚠" },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl p-4 flex items-center gap-3 border t-border-subtle t-bg-card transition-colors light-shadow">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center text-white font-bold shadow-lg text-sm`}>{s.icon}</div>
            <div>
              <p className="text-lg font-bold t-text-primary">{s.value}</p>
              <p className="text-xs t-text-muted">{s.label}</p>
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
      <TaskFilters filters={filters} onChange={setFilters} taskCount={tasks.length} />

      {/* ── Tasks Table ────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-bold t-text-primary mb-4">My Assigned Tasks</h2>
        {tasks.length === 0 ? (
          <div className="text-center py-16 t-bg-card rounded-2xl border t-border-subtle">
            <p className="text-4xl mb-3">📋</p>
            <p className="t-text-muted text-sm">No tasks assigned to you yet.</p>
          </div>
        ) : (
          <div className="rounded-2xl border t-border-subtle t-bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="border-b t-border-subtle t-text-muted text-[11px] uppercase tracking-wider font-bold bg-zinc-500/5">
                    <th className="px-6 py-4">ID</th>
                    <th className="px-6 py-4">Task Details</th>
                    <th className="px-6 py-4">Project</th>
                    <th className="px-6 py-4">Priority</th>
                    <th className="px-6 py-4">Status</th>
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
                            <span className={`font-bold text-sm ${overdue ? "text-red-500" : "t-text-primary"}`}>{t.title}</span>
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
      </section>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {completingTask && <CompleteTaskModal taskId={completingTask.id} taskTitle={completingTask.title} currentUserName={user?.name || ""} onConfirm={handleCompleteConfirm} onCancel={() => setCompletingTask(null)} submitting={completingSubmitting} />}
      {timelineTaskId && <TaskTimeline taskId={timelineTaskId} onClose={() => setTimelineTaskId(null)} />}
    </div>
  );
}
