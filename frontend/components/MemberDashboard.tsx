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
  Pending: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  "In-Progress": "bg-blue-500/15 text-blue-400 border-blue-500/20",
  Completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
};

const priorityStyle: Record<string, string> = {
  Low: "bg-gray-500/15 text-gray-400 border-gray-500/20",
  Medium: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  High: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  Urgent: "bg-red-500/15 text-red-400 border-red-500/20",
};

const priorityIcon: Record<string, string> = {
  Low: "▽",
  Medium: "◆",
  High: "▲",
  Urgent: "🔥",
};

const STATUS_OPTIONS = ["Pending", "In-Progress", "Completed"];

const DEFAULT_FILTERS = {
  search: "",
  statuses: [] as string[],
  priorities: [] as string[],
  sortBy: "createdAt",
  sortOrder: "DESC" as const,
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

  // Completion modal state
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [completingSubmitting, setCompletingSubmitting] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);

      // Build query params from filters
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

  // Non-complete status updates (Pending, In-Progress)
  const handleStatusUpdate = async (taskId: number, newStatus: string) => {
    // If completing, show the modal instead
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
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to update status.");
    } finally {
      setUpdatingId(null);
    }
  };

  // Handle completion confirmation from modal
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
        setTasks((prev) =>
          prev.map((t) =>
            t.id === completingTask.id
              ? { ...t, status: "Completed", completedBy, completedAt }
              : t
          )
        );
        setCompletingTask(null);
      }
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Failed to complete task."
      );
    } finally {
      setCompletingSubmitting(false);
    }
  };

  // ── Stats ─────────────────────────────────────────────────────────────────
  const pending = tasks.filter((t) => t.status === "Pending").length;
  const inProgress = tasks.filter((t) => t.status === "In-Progress").length;
  const completed = tasks.filter((t) => t.status === "Completed").length;
  const overdue = tasks.filter(isOverdue).length;

  if (loading && tasks.length === 0) return <SkeletonLoader count={4} />;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Stats ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total", value: tasks.length, color: "from-indigo-500 to-indigo-700", icon: "📊" },
          { label: "Pending", value: pending, color: "from-amber-500 to-amber-700", icon: "⏳" },
          { label: "In Progress", value: inProgress, color: "from-blue-500 to-blue-700", icon: "🔄" },
          { label: "Completed", value: completed, color: "from-emerald-500 to-emerald-700", icon: "✅" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl p-4 flex items-center gap-3 border transition-colors light-shadow"
            style={{
              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)",
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            }}
          >
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center text-white font-bold shadow-lg text-sm`}>{s.icon}</div>
            <div>
              <p className="text-lg font-bold t-text-primary">{s.value}</p>
              <p className="text-xs t-text-muted">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {overdue > 0 && (
        <div
          className="rounded-xl px-5 py-3 text-sm font-medium border"
          style={{
            background: isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.05)",
            borderColor: "rgba(239,68,68,0.3)",
            color: isDark ? "#fca5a5" : "#dc2626",
          }}
        >
          ⚠ You have <span className="font-bold">{overdue}</span> overdue task{overdue > 1 ? "s" : ""}.
        </div>
      )}

      {/* ── Task Filters ──────────────────────────────────────────────────── */}
      <TaskFilters filters={filters} onChange={setFilters} taskCount={tasks.length} />

      {/* ── Task Cards ────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-bold t-text-primary mb-4">My Tasks</h2>
        {tasks.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📋</p>
            <p className="t-text-muted text-sm">No tasks match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {tasks.map((t) => {
              const od = isOverdue(t);
              const isUpdating = updatingId === t.id;
              return (
                <div
                  key={t.id}
                  className={`rounded-2xl p-6 transition-all border ${od ? "border-2 border-red-500/50" : "light-shadow"}`}
                  style={{
                    background: od
                      ? (isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.05)")
                      : (isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)"),
                    borderColor: od
                      ? undefined
                      : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono t-text-muted">#{t.id}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${priorityStyle[t.priority] || ""}`}>
                          {priorityIcon[t.priority]} {t.priority}
                        </span>
                      </div>
                      <h3 className={`font-semibold text-base ${od ? "text-red-400" : "t-text-primary"}`}>{t.title}</h3>
                    </div>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium shrink-0 ml-2 ${statusStyle[t.status] || ""}`}>{t.status}</span>
                  </div>

                  {t.description && <p className="t-text-secondary text-sm line-clamp-2 mb-3">{t.description}</p>}
                  {od && <p className="text-xs text-red-400 font-semibold mb-3">⚠ OVERDUE</p>}

                  {/* Meta */}
                  <div
                    className="pt-3 border-t flex items-center justify-between text-xs t-text-muted mb-4"
                    style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}
                  >
                    <span>📁 {t.project?.title || "—"}</span>
                    <span>Due: {t.dueDate}</span>
                  </div>

                  {/* Status Updater + Timeline */}
                  <div className="flex items-center gap-2">
                    {t.status !== "Completed" ? (
                      <>
                        {STATUS_OPTIONS.filter((s) => s !== t.status && s !== "Pending").map((s) => (
                          <button key={s} disabled={isUpdating} onClick={() => handleStatusUpdate(t.id, s)}
                            className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer disabled:opacity-40 ${
                              s === "In-Progress"
                                ? "bg-blue-500/15 text-blue-400 border border-blue-500/20 hover:bg-blue-500/25"
                                : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25"
                            }`}
                          >
                            {isUpdating ? "…" : s === "In-Progress" ? "▶ Start" : "✓ Complete"}
                          </button>
                        ))}
                      </>
                    ) : (
                      <div className="flex-1 text-center py-1">
                        <p className="text-xs text-emerald-500 font-medium">✓ Task completed</p>
                        {t.completedBy && (
                          <p className="text-[10px] t-text-muted mt-0.5">
                            by {t.completedBy} {t.completedAt ? `on ${t.completedAt}` : ""}
                          </p>
                        )}
                      </div>
                    )}
                    <button
                      onClick={() => setTimelineTaskId(t.id)}
                      className="px-2.5 py-2 rounded-xl text-[10px] bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-all cursor-pointer font-medium shrink-0"
                    >
                      📜
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Complete Task Modal ─────────────────────────────────────────────── */}
      {completingTask && (
        <CompleteTaskModal
          taskId={completingTask.id}
          taskTitle={completingTask.title}
          currentUserName={user?.name || ""}
          onConfirm={handleCompleteConfirm}
          onCancel={() => setCompletingTask(null)}
          submitting={completingSubmitting}
        />
      )}

      {/* ── Timeline Modal ─────────────────────────────────────────────────── */}
      {timelineTaskId && (
        <TaskTimeline taskId={timelineTaskId} onClose={() => setTimelineTaskId(null)} />
      )}
    </div>
  );
}
