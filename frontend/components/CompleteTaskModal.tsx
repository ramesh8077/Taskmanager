"use client";

/**
 * CompleteTaskModal
 *
 * Modal that appears when an agent/admin tries to mark a task as "Completed".
 * Requires:
 *   - Completed By: Name of the person completing the task (pre-filled with current user)
 *   - Completion Date: Date picker with min=today (past dates disabled)
 */ 

import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";

interface CompleteTaskModalProps {
  taskId: number;
  taskTitle: string;
  currentUserName: string;
  onConfirm: (data: { completedBy: string; completedAt: string }) => void;
  onCancel: () => void;
  submitting?: boolean;
}

export default function CompleteTaskModal({
  taskId,
  taskTitle,
  currentUserName,
  onConfirm,
  onCancel,
  submitting = false,
}: CompleteTaskModalProps) {
  const { isDark } = useTheme();

  // Pre-fill with current user name
  const [completedBy, setCompletedBy] = useState(currentUserName);
  // Default to today's date
  const [completedAt, setCompletedAt] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0]; // YYYY-MM-DD format
  });

  // Today's date string for min attribute (disables past dates)
  const todayStr = new Date().toISOString().split("T")[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completedBy.trim()) return;
    if (!completedAt) return;
    onConfirm({ completedBy: completedBy.trim(), completedAt });
  };

  const inputStyle = {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "var(--overlay-bg)" }}
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl border shadow-2xl animate-slide-up"
        style={{
          background: "var(--modal-bg)",
          borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="px-6 pt-6 pb-4 border-b"
          style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white text-lg shadow-lg">
              ✓
            </div>
            <div>
              <h2 className="text-lg font-bold t-text-primary">Complete Task</h2>
              <p className="text-xs t-text-muted">Mark this task as completed</p>
            </div>
          </div>
          <div
            className="mt-3 px-3 py-2 rounded-lg text-sm t-text-secondary"
            style={{
              background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
            }}
          >
            <span className="text-[10px] font-mono t-text-muted">#{taskId}</span>
            <span className="ml-2 font-medium t-text-primary">{taskTitle}</span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* Completed By */}
          <div>
            <label className="block text-sm font-medium t-text-label mb-1.5">
              Completed By <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={completedBy}
              onChange={(e) => setCompletedBy(e.target.value)}
              placeholder="Enter name of person completing this task"
              required
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all t-text-primary placeholder:t-text-muted"
              style={inputStyle}
            />
            <p className="text-[11px] t-text-muted mt-1">
              Name of the person who completed this task
            </p>
          </div>

          {/* Completion Date */}
          <div>
            <label className="block text-sm font-medium t-text-label mb-1.5">
              Completion Date <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={completedAt}
              onChange={(e) => setCompletedAt(e.target.value)}
              min={todayStr}
              required
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all t-text-primary cursor-pointer"
              style={inputStyle}
            />
            <p className="text-[11px] t-text-muted mt-1">
              📅 Only today or future dates can be selected
            </p>
          </div>

          {/* Actions */}
          <div
            className="flex justify-end gap-3 pt-3 border-t"
            style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}
          >
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="px-4 py-2 rounded-xl text-sm t-text-muted hover:t-text-primary transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !completedBy.trim() || !completedAt}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer hover:shadow-lg hover:shadow-emerald-500/25 transition-all"
            >
              {submitting ? "Completing…" : "✓ Mark as Completed"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
