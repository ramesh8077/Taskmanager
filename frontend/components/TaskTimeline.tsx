"use client";

/**
 * TaskTimeline
 *
 * Displays the complete history/timeline of a task in a beautiful
 * vertical timeline layout. Shows all status changes, priority changes,
 * creation events, etc.
 */

import { useState, useEffect } from "react";
import API from "@/lib/axios";
import { useTheme } from "@/context/ThemeContext";
import toast from "react-hot-toast";
import { TaskProgressControl } from "@/components/TaskProgress";

interface HistoryEntry {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  action: string;
  createdAt: string;
  changedByUser?: { id: number; name: string; email: string };
}

interface TaskDetail {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueDate: string;
  completedAt?: string | null;
  description?: string | null;
  progress: number;
  project?: { id: number; title: string };
  assignee?: { id: number; name: string; email: string };
}

interface TaskTimelineProps {
  taskId: number;
  onClose: () => void;
}

const actionIcons: Record<string, string> = {
  created: "🎯",
  status_changed: "🔄",
  priority_changed: "⚡",
  reassigned: "👤",
  updated: "✏️",
};

const actionColors: Record<string, string> = {
  created: "from-emerald-500 to-emerald-600",
  status_changed: "from-blue-500 to-blue-600",
  priority_changed: "from-amber-500 to-amber-600",
  reassigned: "from-violet-500 to-violet-600",
  updated: "from-gray-500 to-gray-600",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getActionLabel(entry: HistoryEntry): string {
  switch (entry.action) {
    case "created":
      return "Task Created";
    case "updated":
      if (entry.field === "progress") return `Progress: ${entry.oldValue}% → ${entry.newValue}%`;
      return `${entry.field} updated`;
    case "status_changed":
      return `Status: ${entry.oldValue} → ${entry.newValue}`;
    case "priority_changed":
      return `Priority: ${entry.oldValue} → ${entry.newValue}`;
    case "reassigned":
      return `Reassigned: ${entry.oldValue} → ${entry.newValue}`;
    default:
      return `${entry.field} updated`;
  }
}

export default function TaskTimeline({ taskId, onClose }: TaskTimelineProps) {
  const { isDark } = useTheme();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        setLoadError("");
        const { data } = await API.get(`/tasks/${taskId}/history`);
        if (data.success) {
          setTask(data.data.task);
          setHistory(data.data.history || []);
        }
      } catch (error) {
        setLoadError((error as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not load task details and history.");
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [taskId, refreshKey]);

  const updateProgress = async (progress: number) => {
    try {
      const { data } = await API.put(`/tasks/${taskId}/progress`, { progress });
      if (!data.success) throw new Error(data.message || "Progress was not saved.");
      setTask((current) => current ? { ...current, progress: data.data.task.progress, status: data.data.task.status } : current);
      try {
        const historyResponse = await API.get(`/tasks/${taskId}/history`);
        setHistory(historyResponse.data.data.history || []);
      } catch {
        toast.error("Progress saved, but the activity timeline could not be refreshed.");
      }
      toast.success("Task progress saved.");
      return true;
    } catch (error) {
      toast.error((error as { response?: { data?: { message?: string } }; message?: string }).response?.data?.message ||
        (error as { message?: string }).message || "Could not update task progress.");
      return false;
    }
  };

  const priorityBadge: Record<string, string> = {
    Low: "bg-slate-100 text-slate-700 border-slate-200",
    Medium: "bg-blue-50 text-blue-700 border-blue-200",
    High: "bg-orange-50 text-orange-700 border-orange-200",
    Urgent: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "var(--overlay-bg)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] rounded-2xl border shadow-2xl animate-slide-up flex flex-col overflow-hidden"
        style={{
          background: "var(--modal-bg)",
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-8 py-6 border-b flex-shrink-0"
          style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="t-text-muted text-xs font-mono">#{taskId}</span>
                {task?.priority && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-wider ${priorityBadge[task.priority] || ""}`}>
                    {task.priority}
                  </span>
                )}
              </div>
              <h2 className="text-xl font-bold t-text-primary truncate">{task?.title || "Loading…"}</h2>
              <div className="flex flex-wrap items-center gap-3 mt-2 text-xs t-text-muted">
                {task?.project && <span>📁 {task.project.title}</span>}
                {task?.assignee && <span>👤 {task.assignee.name}</span>}
                {task?.dueDate && <span>📅 {task.dueDate}</span>}
                {task?.completedAt && <span>✓ Completed {task.completedAt}</span>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center t-text-muted hover:t-text-primary transition-colors cursor-pointer"
              style={{ background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Timeline Body */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm t-text-muted">Loading timeline…</p>
            </div>
          ) : loadError ? (
            <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-700">{loadError}<button type="button" className="ml-3 font-semibold underline" onClick={() => setRefreshKey((key) => key + 1)}>Retry</button></div>
          ) : (
            <>
              {task && <section className="rounded-xl border t-border-subtle p-4">
                <h3 className="text-sm font-semibold t-text-primary">Task details</h3>
                <p className="mt-2 whitespace-pre-wrap text-sm t-text-secondary">{task.description || "No description provided."}</p>
                <div className="mt-4"><TaskProgressControl progress={task.status === "Completed" ? 100 : task.progress || 0} status={task.status} onSave={updateProgress} size={52} /></div>
                <p className="mt-3 text-xs t-text-muted">Subtasks, comments, and attachments are not configured in this project. They are not shown as historical data.</p>
              </section>}
              {history.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="mb-3 text-4xl">📋</p>
                  <p className="text-sm t-text-muted">No historical activity is available for this task. New supported actions will be recorded going forward.</p>
                </div>
              ) : (
                <div className="relative">
                  <div
                    className="absolute bottom-2 left-[17px] top-2 w-[2px]"
                    style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }}
                  />
                  <div className="space-y-6">
                    {history.map((entry, index) => (
                      <div key={entry.id} className="relative flex gap-4 animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
                        <div className={`z-10 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${actionColors[entry.action] || "from-gray-500 to-gray-600"} text-sm shadow-lg`}>
                          {actionIcons[entry.action] || "📝"}
                        </div>
                        <div
                          className="flex-1 rounded-xl border p-4 transition-colors"
                          style={{
                            background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                            borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                          }}
                        >
                          <p className="text-sm font-semibold t-text-primary">{getActionLabel(entry)}</p>
                          {entry.newValue && entry.action === "created" && <p className="mt-1 text-xs t-text-muted">{entry.newValue}</p>}
                          <div className="mt-2 flex items-center justify-between">
                            <span className="text-[11px] t-text-muted">by {entry.changedByUser?.name || "System"}</span>
                            <span className="text-[11px] t-text-muted">{formatDate(entry.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
