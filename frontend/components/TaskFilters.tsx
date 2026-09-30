"use client";

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
    active: "bg-amber-200 text-amber-950 border-amber-500",
    inactive:
      "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 hover:border-amber-400",
  },
  "In-Progress": {
    active: "bg-blue-200 text-blue-950 border-blue-500",
    inactive:
      "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 hover:border-blue-400",
  },
  Completed: {
    active: "bg-emerald-200 text-emerald-950 border-emerald-500",
    inactive:
      "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-400",
  },
};

const priorityColors: Record<string, { active: string; inactive: string }> = {
  Low: {
    active: "bg-slate-200 text-slate-950 border-slate-500",
    inactive:
      "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-400",
  },
  Medium: {
    active: "bg-blue-200 text-blue-950 border-blue-500",
    inactive:
      "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 hover:border-blue-400",
  },
  High: {
    active: "bg-orange-200 text-orange-950 border-orange-500",
    inactive:
      "bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100 hover:border-orange-400",
  },
  Urgent: {
    active: "bg-red-200 text-red-950 border-red-500",
    inactive:
      "bg-red-50 text-red-800 border-red-200 hover:bg-red-100 hover:border-red-400",
  },
};

export default function TaskFilters({
  filters,
  onChange,
  taskCount,
}: TaskFiltersProps) {
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
    onChange({
      ...filters,
      sortOrder: filters.sortOrder === "ASC" ? "DESC" : "ASC",
    });
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

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 transition-colors light-shadow text-slate-900"
      style={{ colorScheme: "light" }}
    >
      {/* Search + Sort Row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-600 pointer-events-none">
            🔍
          </span>

          <input
            type="text"
            value={filters.search}
            onChange={(e) =>
              onChange({ ...filters, search: e.target.value })
            }
            placeholder="Search by title, agent name, task ID..."
            aria-label="Search tasks"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all bg-slate-50 border border-slate-300 text-slate-900 placeholder:text-slate-500 focus:border-indigo-500"
          />

          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ ...filters, search: "" })}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sort By */}
        <div className="flex gap-2 items-center">
          <select
            value={filters.sortBy}
            onChange={(e) =>
              onChange({ ...filters, sortBy: e.target.value })
            }
            aria-label="Sort tasks by"
            className="px-3 py-2.5 rounded-xl text-sm outline-none bg-slate-50 border border-slate-300 text-slate-900 cursor-pointer appearance-none min-w-[140px] focus:border-indigo-500"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Sort Direction Toggle */}
          <button
            type="button"
            onClick={toggleSortOrder}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold transition-all cursor-pointer shrink-0 bg-slate-50 border border-slate-300 text-slate-700 hover:bg-slate-100"
            title={filters.sortOrder === "ASC" ? "Ascending" : "Descending"}
            aria-label={
              filters.sortOrder === "ASC"
                ? "Change to descending order"
                : "Change to ascending order"
            }
          >
            {filters.sortOrder === "ASC" ? "↑" : "↓"}
          </button>
        </div>
      </div>

      {/* Filter Chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider mr-1">
          Status:
        </span>

        {STATUS_OPTIONS.map((s) => {
          const isActive = filters.statuses.includes(s);
          const colors = statusColors[s];

          return (
            <button
              type="button"
              key={s}
              onClick={() => toggleStatus(s)}
              aria-pressed={isActive}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isActive ? colors.active : colors.inactive
              }`}
            >
              {s}
            </button>
          );
        })}

        <span className="mx-2 h-5 w-px bg-slate-200" />

        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider mr-1">
          Priority:
        </span>

        {PRIORITY_OPTIONS.map((p) => {
          const isActive = filters.priorities.includes(p);
          const colors = priorityColors[p];

          return (
            <button
              type="button"
              key={p}
              onClick={() => togglePriority(p)}
              aria-pressed={isActive}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                isActive ? colors.active : colors.inactive
              }`}
            >
              {p}
            </button>
          );
        })}
      </div>

      {/* Overdue Toggle + Clear + Count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() =>
              onChange({
                ...filters,
                overdue: !filters.overdue,
                statuses: filters.overdue ? filters.statuses : [],
              })
            }
            aria-pressed={filters.overdue}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              filters.overdue
                ? "bg-red-200 text-red-950 border-red-500"
                : "bg-red-50 text-red-800 border-red-200 hover:bg-red-100 hover:border-red-400"
            }`}
          >
            ⚠ Overdue
          </button>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900 transition-colors cursor-pointer"
            >
              ✕ Clear all
            </button>
          )}
        </div>

        <span className="text-xs text-slate-600">
          <span className="font-semibold text-slate-900">{taskCount}</span>{" "}
          task{taskCount !== 1 ? "s" : ""} found
        </span>
      </div>
    </div>
  );
}