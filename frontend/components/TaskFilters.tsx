"use client";

/**
 * TaskFilters
 *
 * A comprehensive filter bar for tasks with:
 *   - Search (by title, description, assignee name, task ID)
 *   - Status filter (Pending, In-Progress, Completed) — multi-select
 *   - Priority filter (Low, Medium, High, Urgent) — multi-select
 *   - Sort by (Due Date, Priority, Status, Created At)
 *   - Sort order toggle (ASC / DESC)
 *   - Overdue toggle
 *   - Clear all filters
 */

import { useTheme } from "@/context/ThemeContext";

export interface FilterState {
  search: string;
  statuses: string[];
  priorities: string[];
  sortBy: string;
  sortOrder: "ASC" | "DESC";
  overdue: boolean;
}

interface TaskFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  taskCount: number;
}

const STATUS_OPTIONS = ["Pending", "In-Progress", "Completed"];
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"];
const SORT_OPTIONS = [
  { value: "createdAt", label: "Created Date" },
  { value: "dueDate", label: "Due Date" },
  { value: "priority", label: "Priority" },
  { value: "status", label: "Status" },
];

const statusColors: Record<string, { active: string; inactive: string }> = {
  Pending: {
    active: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    inactive: "text-amber-400/60 border-amber-500/15 hover:border-amber-500/30",
  },
  "In-Progress": {
    active: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    inactive: "text-blue-400/60 border-blue-500/15 hover:border-blue-500/30",
  },
  Completed: {
    active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    inactive: "text-emerald-400/60 border-emerald-500/15 hover:border-emerald-500/30",
  },
};

const priorityColors: Record<string, { active: string; inactive: string }> = {
  Low: {
    active: "bg-gray-500/20 text-gray-400 border-gray-500/40",
    inactive: "text-gray-400/60 border-gray-500/15 hover:border-gray-500/30",
  },
  Medium: {
    active: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    inactive: "text-blue-400/60 border-blue-500/15 hover:border-blue-500/30",
  },
  High: {
    active: "bg-orange-500/20 text-orange-400 border-orange-500/40",
    inactive: "text-orange-400/60 border-orange-500/15 hover:border-orange-500/30",
  },
  Urgent: {
    active: "bg-red-500/20 text-red-400 border-red-500/40",
    inactive: "text-red-400/60 border-red-500/15 hover:border-red-500/30",
  },
};

export default function TaskFilters({ filters, onChange, taskCount }: TaskFiltersProps) {
  const { isDark } = useTheme();

  const toggleStatus = (status: string) => {
    const current = [...filters.statuses];
    const idx = current.indexOf(status);
    if (idx > -1) {
      current.splice(idx, 1);
    } else {
      current.push(status);
    }
    onChange({ ...filters, statuses: current, overdue: false });
  };

  const togglePriority = (priority: string) => {
    const current = [...filters.priorities];
    const idx = current.indexOf(priority);
    if (idx > -1) {
      current.splice(idx, 1);
    } else {
      current.push(priority);
    }
    onChange({ ...filters, priorities: current });
  };

  const toggleSortOrder = () => {
    onChange({ ...filters, sortOrder: filters.sortOrder === "ASC" ? "DESC" : "ASC" });
  };

  const clearAll = () => {
    onChange({
      search: "",
      statuses: [],
      priorities: [],
      sortBy: "createdAt",
      sortOrder: "DESC",
      overdue: false,
    });
  };

  const hasActiveFilters =
    filters.search ||
    filters.statuses.length > 0 ||
    filters.priorities.length > 0 ||
    filters.overdue ||
    filters.sortBy !== "createdAt" ||
    filters.sortOrder !== "DESC";

  const inputBg = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const inputBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";

  return (
    <div
      className="rounded-2xl border p-5 space-y-4 transition-colors light-shadow"
      style={{
        background: isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.8)",
        borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)",
      }}
    >
      {/* ── Search + Sort Row ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm t-text-muted pointer-events-none">🔍</span>
          <input
            type="text"
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Search by title, agent name, task ID..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all t-text-primary placeholder:t-text-muted"
            style={{
              background: inputBg,
              border: `1px solid ${inputBorder}`,
            }}
          />
          {filters.search && (
            <button
              onClick={() => onChange({ ...filters, search: "" })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs t-text-muted hover:t-text-primary cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sort By */}
        <div className="flex gap-2 items-center">
          <select
            value={filters.sortBy}
            onChange={(e) => onChange({ ...filters, sortBy: e.target.value })}
            className="px-3 py-2.5 rounded-xl text-sm outline-none t-text-primary cursor-pointer appearance-none min-w-[140px]"
            style={{
              background: inputBg,
              border: `1px solid ${inputBorder}`,
            }}
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Sort Direction Toggle */}
          <button
            onClick={toggleSortOrder}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all cursor-pointer shrink-0"
            style={{
              background: inputBg,
              border: `1px solid ${inputBorder}`,
              color: isDark ? "#94a3b8" : "#475569",
            }}
            title={filters.sortOrder === "ASC" ? "Ascending" : "Descending"}
          >
            {filters.sortOrder === "ASC" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {/* ── Filter Chips ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold t-text-muted uppercase tracking-wider mr-1">Status:</span>
        {STATUS_OPTIONS.map((s) => {
          const isActive = filters.statuses.includes(s);
          const colors = statusColors[s];
          return (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isActive ? colors.active : colors.inactive
              }`}
            >
              {s}
            </button>
          );
        })}

        <span className="mx-2 h-5 w-px" style={{ background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} />

        <span className="text-xs font-semibold t-text-muted uppercase tracking-wider mr-1">Priority:</span>
        {PRIORITY_OPTIONS.map((p) => {
          const isActive = filters.priorities.includes(p);
          const colors = priorityColors[p];
          return (
            <button
              key={p}
              onClick={() => togglePriority(p)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isActive ? colors.active : colors.inactive
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* ── Overdue Toggle + Clear + Count ─────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => onChange({ ...filters, overdue: !filters.overdue, statuses: filters.overdue ? filters.statuses : [] })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              filters.overdue
                ? "bg-red-500/20 text-red-400 border-red-500/40"
                : "text-red-400/60 border-red-500/15 hover:border-red-500/30"
            }`}
          >
            ⚠ Overdue
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearAll}
              className="px-3 py-1.5 rounded-lg text-xs font-medium t-text-muted hover:t-text-primary transition-colors cursor-pointer"
              style={{
                background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
              }}
            >
              ✕ Clear all
            </button>
          )}
        </div>

        <span className="text-xs t-text-muted">
          <span className="font-semibold t-text-secondary">{taskCount}</span> task{taskCount !== 1 ? "s" : ""} found
        </span>
      </div>
    </div>
  );
}
