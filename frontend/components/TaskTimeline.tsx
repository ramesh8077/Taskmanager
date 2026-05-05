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

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const { data } = await API.get(`/tasks/${taskId}/history`);
        if (data.success) {
          setTask(data.data.task);
          setHistory(data.data.history || []);
        }
      } catch {
        // Silently handle — modal will show empty state
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [taskId]);

  const priorityBadge: Record<string, string> = {
    Low: "bg-gray-500/15 text-gray-400 border-gray-500/20",
    Medium: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    High: "bg-orange-500/15 text-orange-400 border-orange-500/20",
    Urgent: "bg-red-500/15 text-red-400 border-red-500/20",
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
              <div className="flex items-center gap-3 mt-2 text-xs t-text-muted">
                {task?.project && <span>📁 {task.project.title}</span>}
                {task?.assignee && <span>👤 {task.assignee.name}</span>}
                {task?.dueDate && <span>📅 {task.dueDate}</span>}
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
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-4xl mb-3">📋</p>
              <p className="t-text-muted text-sm">No history entries yet.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div
                className="absolute left-[17px] top-2 bottom-2 w-[2px]"
                style={{ background: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }}
              />

              <div className="space-y-6">
                {history.map((entry, index) => (
                  <div key={entry.id} className="relative flex gap-4 animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
                    {/* Timeline dot */}
                    <div
                      className={`w-9 h-9 rounded-xl bg-gradient-to-br ${actionColors[entry.action] || "from-gray-500 to-gray-600"} flex items-center justify-center text-sm shadow-lg flex-shrink-0 z-10`}
                    >
                      {actionIcons[entry.action] || "📝"}
                    </div>

                    {/* Content */}
                    <div
                      className="flex-1 rounded-xl p-4 border transition-colors"
                      style={{
                        background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                        borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
                      }}
                    >
                      <p className="text-sm font-semibold t-text-primary">
                        {getActionLabel(entry)}
                      </p>
                      {entry.newValue && entry.action === "created" && (
                        <p className="text-xs t-text-muted mt-1">{entry.newValue}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[11px] t-text-muted">
                          by {entry.changedByUser?.name || "System"}
                        </span>
                        <span className="text-[11px] t-text-muted">
                          {formatDate(entry.createdAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
