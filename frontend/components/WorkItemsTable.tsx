"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import API from "@/lib/axios";
import { useAuth } from "@/context/AuthContext";

type View = "tasks" | "tickets";
type Status = "PENDING" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "BLOCKED" | "ALL";
type SortBy = "createdAt" | "deadline" | "priority";
type Position = "MANAGER" | "SUB_MANAGER" | "TEAM_LEAD" | "EMPLOYEE" | "INTERN";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

interface Filters {
  view: View;
  status: Status;
  assignedTo?: number;
  assigneePosition: Position[];
  createdBy?: number;
  department: string[];
  priority: Priority[];
  deadlineFrom: string;
  deadlineTo: string;
  createdFrom: string;
  createdTo: string;
  overdue: boolean;
  search: string;
  page: number;
  pageSize: number;
  sortBy: SortBy;
  sortOrder: "ASC" | "DESC";
}

interface PersonOption {
  id: number;
  name: string;
  department: string;
  position: Position | "MANAGER";
}

interface WorkItem {
  type: "task" | "ticket";
  id: number;
  referenceId: string;
  title: string;
  assignedTo: PersonOption | null;
  createdBy: Pick<PersonOption, "id" | "name" | "position"> | null;
  createdAt: string;
  department: string;
  priority: string;
  deadline: string | null;
  status: string;
  rawStatus: string;
}

interface Result {
  data: WorkItem[];
  total: number;
  page: number;
  pageSize: number;
  counts: {
    pending: number;
    inProgress: number;
    inReview: number;
    done: number;
    blocked: number;
    all: number;
  };
  viewCounts: { tasks: number; tickets: number };
  filterOptions: {
    assignees: PersonOption[];
    creators: PersonOption[];
    departments: string[];
    positions: Position[];
  };
}

interface ApiResponse {
  success: boolean;
  data: Result;
  message?: string;
}

const initialFilters: Filters = {
  view: "tasks",
  status: "PENDING",
  assigneePosition: [],
  department: [],
  priority: [],
  deadlineFrom: "",
  deadlineTo: "",
  createdFrom: "",
  createdTo: "",
  overdue: false,
  search: "",
  page: 1,
  pageSize: 20,
  sortBy: "deadline",
  sortOrder: "ASC",
};

const statusTabs: Array<{ value: Status; label: string; countKey: keyof Result["counts"] }> = [
  { value: "PENDING", label: "Pending", countKey: "pending" },
  { value: "IN_PROGRESS", label: "In Progress", countKey: "inProgress" },
  { value: "IN_REVIEW", label: "In Review", countKey: "inReview" },
  { value: "DONE", label: "Done", countKey: "done" },
  { value: "BLOCKED", label: "Blocked", countKey: "blocked" },
  { value: "ALL", label: "All", countKey: "all" },
];

const priorityOptions: Array<{ value: Priority; label: string }> = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const statusLabels: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  IN_REVIEW: "In Review",
  DONE: "Done",
  BLOCKED: "Blocked",
};

const positionLabel = (position: string) =>
  position.toLowerCase().replaceAll("_", " ");

function parseList<T extends string>(value: string | null, valid: readonly T[]): T[] {
  if (!value) return [];
  return value.split(",").filter((entry): entry is T => valid.includes(entry as T));
}

function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const rawPageSize = Number(params.get("pageSize"));
  const rawPage = Number(params.get("page"));
  const statusValues = statusTabs.map((tab) => tab.value);
  const sortByValues: SortBy[] = ["createdAt", "deadline", "priority"];
  return {
    ...initialFilters,
    view: params.get("view") === "tickets" ? "tickets" : "tasks",
    status: statusValues.includes(params.get("status") as Status)
      ? params.get("status") as Status
      : initialFilters.status,
    assignedTo: Number(params.get("assignedTo")) > 0 ? Number(params.get("assignedTo")) : undefined,
    assigneePosition: parseList(params.get("assigneePosition"), ["MANAGER", "SUB_MANAGER", "TEAM_LEAD", "EMPLOYEE", "INTERN"]),
    createdBy: Number(params.get("createdBy")) > 0 ? Number(params.get("createdBy")) : undefined,
    department: params.get("department")?.split(",").filter(Boolean) || [],
    priority: parseList(params.get("priority"), ["LOW", "MEDIUM", "HIGH", "URGENT"]),
    deadlineFrom: params.get("deadlineFrom") || "",
    deadlineTo: params.get("deadlineTo") || "",
    createdFrom: params.get("createdFrom") || "",
    createdTo: params.get("createdTo") || "",
    overdue: params.get("overdue") === "true",
    search: params.get("search") || "",
    page: Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize: [10, 20, 50, 100].includes(rawPageSize) ? rawPageSize : 20,
    sortBy: sortByValues.includes(params.get("sortBy") as SortBy)
      ? params.get("sortBy") as SortBy
      : "deadline",
    sortOrder: params.get("sortOrder") === "DESC" ? "DESC" : "ASC",
  };
}

function writeFilters(filters: Filters, replace = false) {
  const params = new URLSearchParams(window.location.search);
  const values: Record<string, string | undefined> = {
    view: filters.view,
    status: filters.status,
    assignedTo: filters.assignedTo ? String(filters.assignedTo) : undefined,
    assigneePosition: filters.assigneePosition.length ? filters.assigneePosition.join(",") : undefined,
    createdBy: filters.createdBy ? String(filters.createdBy) : undefined,
    department: filters.department.length ? filters.department.join(",") : undefined,
    priority: filters.priority.length ? filters.priority.join(",") : undefined,
    deadlineFrom: filters.deadlineFrom || undefined,
    deadlineTo: filters.deadlineTo || undefined,
    createdFrom: filters.createdFrom || undefined,
    createdTo: filters.createdTo || undefined,
    overdue: filters.overdue ? "true" : undefined,
    search: filters.search || undefined,
    page: String(filters.page),
    pageSize: String(filters.pageSize),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const url = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
}

function personOptionLabel(person: PersonOption) {
  return `${person.name} — ${person.department} · ${positionLabel(person.position)} (#${person.id})`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function deadlineRange(days: number) {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + days);
  return {
    deadlineFrom: start.toISOString().slice(0, 10),
    deadlineTo: end.toISOString().slice(0, 10),
  };
}

function errorText(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "data" in error.response &&
    typeof error.response.data === "object" &&
    error.response.data !== null &&
    "message" in error.response.data &&
    typeof error.response.data.message === "string"
  ) {
    return error.response.data.message;
  }
  return "Could not load work items. Please try again.";
}

export default function WorkItemsTable() {
  const { user } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [filtersReady, setFiltersReady] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [creatorSearch, setCreatorSearch] = useState("");
  const filtersRef = useRef(initialFilters);

  const showManagementFilters = ["MANAGER", "SUB_MANAGER", "TEAM_LEAD"].includes(user?.position || "");
  const isManager = user?.position === "MANAGER";
  const pageCount = Math.max(1, Math.ceil((result?.total || 0) / filters.pageSize));

  useEffect(() => {
    const onPopState = () => {
      const restoredFilters = readFilters();
      filtersRef.current = restoredFilters;
      setFilters(restoredFilters);
    };
    window.addEventListener("popstate", onPopState);
    const timer = window.setTimeout(() => {
      const restored = readFilters();
      filtersRef.current = restored;
      setFilters(restored);
      writeFilters(restored, true);
      setFiltersReady(true);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const params: Record<string, string | number> = {
          view: filters.view,
          status: filters.status,
          page: filters.page,
          pageSize: filters.pageSize,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
        };
        if (filters.assignedTo) params.assignedTo = filters.assignedTo;
        if (filters.assigneePosition.length) params.assigneePosition = filters.assigneePosition.join(",");
        if (filters.createdBy) params.createdBy = filters.createdBy;
        if (filters.department.length) params.department = filters.department.join(",");
        if (filters.priority.length) params.priority = filters.priority.join(",");
        if (filters.deadlineFrom) params.deadlineFrom = filters.deadlineFrom;
        if (filters.deadlineTo) params.deadlineTo = filters.deadlineTo;
        if (filters.createdFrom) params.createdFrom = filters.createdFrom;
        if (filters.createdTo) params.createdTo = filters.createdTo;
        if (filters.overdue) params.overdue = "true";
        if (filters.search) params.search = filters.search;
        const response = await API.get<ApiResponse>("/work-items", {
          params,
          signal: controller.signal,
        });
        setResult(response.data.data);
        if (filters.assignedTo) {
          const assignee = response.data.data.filterOptions.assignees.find((person) => person.id === filters.assignedTo);
          setAssigneeSearch(assignee ? personOptionLabel(assignee) : "");
        }
        if (filters.createdBy) {
          const creator = response.data.data.filterOptions.creators.find((person) => person.id === filters.createdBy);
          setCreatorSearch(creator ? personOptionLabel(creator) : "");
        }
      } catch (requestError) {
        if (!controller.signal.aborted) setError(errorText(requestError));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, filtersReady]);

  const updateFilters = useCallback((patch: Partial<Filters>, resetPage = true, replaceUrl = false) => {
    const current = filtersRef.current;
    const next = { ...current, ...patch, page: resetPage ? 1 : patch.page ?? current.page };
    filtersRef.current = next;
    setFilters(next);
    writeFilters(next, replaceUrl);
  }, []);

  const clearFilters = useCallback(() => {
    setAssigneeSearch("");
    setCreatorSearch("");
    updateFilters({
      status: "PENDING",
      assignedTo: undefined,
      assigneePosition: [],
      createdBy: undefined,
      department: [],
      priority: [],
      deadlineFrom: "",
      deadlineTo: "",
      createdFrom: "",
      createdTo: "",
      overdue: false,
      search: "",
      page: 1,
      pageSize: 20,
      sortBy: "deadline",
      sortOrder: "ASC",
    });
  }, [updateFilters]);

  const removeChip = useCallback((key: keyof Filters, value?: string) => {
    if (key === "assigneePosition" || key === "department" || key === "priority") {
      const current = filters[key] as string[];
      updateFilters({ [key]: current.filter((entry) => entry !== value) });
      return;
    }
    const reset: Partial<Filters> = {
      assignedTo: undefined,
      createdBy: undefined,
      overdue: false,
      search: "",
    };
    if (key === "deadlineFrom") {
      updateFilters({ deadlineFrom: "", deadlineTo: "" });
      return;
    }
    if (key === "createdFrom") {
      updateFilters({ createdFrom: "", createdTo: "" });
      return;
    }
    if (key in reset) {
      if (key === "assignedTo") setAssigneeSearch("");
      if (key === "createdBy") setCreatorSearch("");
      updateFilters({ [key]: reset[key] } as Partial<Filters>);
    }
  }, [filters, updateFilters]);

  const chips = useMemo(() => {
    if (!result) return [];
    const items: Array<{ key: keyof Filters; label: string; value?: string }> = [];
    if (filters.assignedTo) {
      const person = result.filterOptions.assignees.find((option) => option.id === filters.assignedTo);
      items.push({ key: "assignedTo", label: `Assigned to: ${person?.name || filters.assignedTo}` });
    }
    if (filters.createdBy) {
      const person = result.filterOptions.creators.find((option) => option.id === filters.createdBy);
      items.push({ key: "createdBy", label: `Created by: ${person?.name || filters.createdBy}` });
    }
    filters.assigneePosition.forEach((value) => items.push({
      key: "assigneePosition",
      value,
      label: `Position: ${positionLabel(value)}`,
    }));
    filters.department.forEach((value) => items.push({ key: "department", value, label: `Department: ${value}` }));
    filters.priority.forEach((value) => items.push({
      key: "priority",
      value,
      label: `Priority: ${priorityOptions.find((option) => option.value === value)?.label || value}`,
    }));
    if (filters.deadlineFrom || filters.deadlineTo) {
      items.push({ key: "deadlineFrom", label: `Deadline: ${filters.deadlineFrom || "Any"} – ${filters.deadlineTo || "Any"}` });
    }
    if (filters.createdFrom || filters.createdTo) {
      items.push({ key: "createdFrom", label: `Created: ${filters.createdFrom || "Any"} – ${filters.createdTo || "Any"}` });
    }
    if (filters.overdue) items.push({ key: "overdue", label: "Overdue only" });
    if (filters.search) items.push({ key: "search", label: `Search: ${filters.search}` });
    return items;
  }, [filters, result]);

  const toggleArrayFilter = (key: "assigneePosition" | "department" | "priority", value: string) => {
    const current = filters[key] as string[];
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    updateFilters({ [key]: next } as Pick<Filters, typeof key>);
  };

  const changeSort = (sortBy: SortBy) => {
    const sortOrder = filters.sortBy === sortBy
      ? filters.sortOrder === "ASC" ? "DESC" : "ASC"
      : sortBy === "createdAt" ? "DESC" : "ASC";
    updateFilters({ sortBy, sortOrder });
  };

  return (
    <section className="work-items" aria-label="Tasks and tickets">
      <div className="work-items-toolbar">
        <div className="work-items-view-switch" role="tablist" aria-label="Work item type">
          <button
            type="button"
            role="tab"
            aria-selected={filters.view === "tasks"}
            className={filters.view === "tasks" ? "is-selected" : ""}
            onClick={() => updateFilters({ view: "tasks", page: 1, sortBy: "deadline", sortOrder: "ASC" })}
          >
            Tasks <span>{result?.viewCounts.tasks ?? "—"}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filters.view === "tickets"}
            className={filters.view === "tickets" ? "is-selected" : ""}
            onClick={() => updateFilters({ view: "tickets", page: 1, sortBy: "deadline", sortOrder: "ASC" })}
          >
            Tickets <span>{result?.viewCounts.tickets ?? "—"}</span>
          </button>
        </div>
        <label className="work-items-search">
          <span className="sr-only">Search</span>
          <input
            type="search"
            value={filters.search}
            placeholder={`Search ${filters.view}…`}
            onChange={(event) => updateFilters({ search: event.target.value }, true, true)}
          />
        </label>
      </div>

      <div className="work-items-status-tabs" role="tablist" aria-label="Filter by status">
        {statusTabs.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={filters.status === tab.value}
            className={filters.status === tab.value ? "is-selected" : ""}
            key={tab.value}
            onClick={() => updateFilters({ status: tab.value })}
          >
            {tab.label} <span>{result?.counts[tab.countKey] ?? "—"}</span>
          </button>
        ))}
      </div>

      {showManagementFilters && (
        <div className="work-items-filters">
          <label className="work-items-field">
            Assigned to
            <input
              list="work-item-assignees"
              value={assigneeSearch}
              placeholder="Search people…"
              onChange={(event) => {
                const value = event.target.value;
                setAssigneeSearch(value);
                const match = result?.filterOptions.assignees.find((person) => personOptionLabel(person) === value);
                updateFilters({ assignedTo: match?.id });
              }}
            />
            <datalist id="work-item-assignees">
              {(result?.filterOptions.assignees || []).map((person) => (
                <option key={person.id} value={personOptionLabel(person)} />
              ))}
            </datalist>
          </label>

          <fieldset className="work-items-fieldset">
            <legend>Assignee position</legend>
            <div className="work-items-checks">
              {(result?.filterOptions.positions || []).map((position) => (
                <label key={position}>
                  <input
                    type="checkbox"
                    checked={filters.assigneePosition.includes(position)}
                    onChange={() => toggleArrayFilter("assigneePosition", position)}
                  />
                  {positionLabel(position)}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="work-items-field">
            Created by
            <input
              list="work-item-creators"
              value={creatorSearch}
              placeholder="Search creators…"
              onChange={(event) => {
                const value = event.target.value;
                setCreatorSearch(value);
                const match = result?.filterOptions.creators.find((person) => personOptionLabel(person) === value);
                updateFilters({ createdBy: match?.id });
              }}
            />
            <datalist id="work-item-creators">
              {(result?.filterOptions.creators || []).map((person) => (
                <option key={person.id} value={personOptionLabel(person)} />
              ))}
            </datalist>
          </label>

          {isManager && (
            <fieldset className="work-items-fieldset">
              <legend>Department</legend>
              <div className="work-items-checks">
                {(result?.filterOptions.departments || []).map((department) => (
                  <label key={department}>
                    <input
                      type="checkbox"
                      checked={filters.department.includes(department)}
                      onChange={() => toggleArrayFilter("department", department)}
                    />
                    {department}
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset className="work-items-fieldset">
            <legend>Priority</legend>
            <div className="work-items-checks">
              {priorityOptions.map((option) => (
                <label key={option.value}>
                  <input
                    type="checkbox"
                    checked={filters.priority.includes(option.value)}
                    onChange={() => toggleArrayFilter("priority", option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="work-items-field">
            Deadline from
            <input type="date" value={filters.deadlineFrom} onChange={(event) => updateFilters({ deadlineFrom: event.target.value })} />
          </label>
          <label className="work-items-field">
            Deadline to
            <input type="date" value={filters.deadlineTo} onChange={(event) => updateFilters({ deadlineTo: event.target.value })} />
          </label>
          <div className="work-items-presets" aria-label="Deadline presets">
            <span>Due:</span>
            <button type="button" onClick={() => updateFilters(deadlineRange(0))}>Today</button>
            <button type="button" onClick={() => updateFilters(deadlineRange(7))}>Next 7 days</button>
            <button type="button" onClick={() => updateFilters(deadlineRange(30))}>Next 30 days</button>
            <button type="button" onClick={() => updateFilters({ deadlineFrom: "", deadlineTo: "" })}>Any</button>
          </div>
          <label className="work-items-field">
            Created from
            <input type="date" value={filters.createdFrom} onChange={(event) => updateFilters({ createdFrom: event.target.value })} />
          </label>
          <label className="work-items-field">
            Created to
            <input type="date" value={filters.createdTo} onChange={(event) => updateFilters({ createdTo: event.target.value })} />
          </label>
          <label className="work-items-overdue">
            <input
              type="checkbox"
              checked={filters.overdue}
              onChange={(event) => updateFilters({ overdue: event.target.checked })}
            />
            Overdue only
          </label>
        </div>
      )}

      <div className="work-items-filter-summary">
        <span>{loading ? "Loading…" : `${result?.total ?? 0} results`}</span>
        {chips.length > 0 && (
          <div className="work-items-chips" aria-label="Active filters">
            {chips.map((chip, index) => (
              <button
                type="button"
                key={`${chip.key}-${chip.value || index}`}
                onClick={() => removeChip(chip.key, chip.value)}
                aria-label={`Remove ${chip.label} filter`}
              >
                {chip.label} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        )}
        {chips.length > 0 && <button type="button" className="work-items-reset" onClick={clearFilters}>Reset all</button>}
      </div>

      {error ? (
        <div className="work-items-state work-items-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setFilters((current) => ({ ...current }))}>Retry</button>
        </div>
      ) : (
        <>
          <div className="work-items-table-scroll">
            <table className="work-items-table">
              <thead>
                <tr>
                  <th>{filters.view === "tasks" ? "Task ID" : "Ticket ID"}</th>
                  <th>Title</th>
                  <th>Assigned To</th>
                  <th>Created By / Assigned By</th>
                  <th>
                    <button type="button" onClick={() => changeSort("createdAt")}>
                      Created date{filters.sortBy === "createdAt" ? (filters.sortOrder === "ASC" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th>Department</th>
                  <th>
                    <button type="button" onClick={() => changeSort("priority")}>
                      Priority{filters.sortBy === "priority" ? (filters.sortOrder === "ASC" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th>
                    <button type="button" onClick={() => changeSort("deadline")}>
                      Deadline{filters.sortBy === "deadline" ? (filters.sortOrder === "ASC" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 6 }, (_, index) => (
                    <tr className="work-items-skeleton" key={index}>
                      {Array.from({ length: 10 }, (_, cell) => <td key={cell}><span /></td>)}
                    </tr>
                  ))
                ) : result?.data.length ? (
                  result.data.map((item) => {
                    const overdue = !!item.deadline &&
                      item.deadline.slice(0, 10) < new Date().toISOString().slice(0, 10) &&
                      item.status !== "DONE";
                    return (
                      <tr key={`${item.type}-${item.id}`}>
                        <td className="work-items-id">{item.referenceId}</td>
                        <td className="work-items-title">{item.title}</td>
                        <td>
                          {item.assignedTo ? (
                            <>
                              <strong>{item.assignedTo.name}</strong>
                              <small>{item.assignedTo.department} · {positionLabel(item.assignedTo.position)}</small>
                            </>
                          ) : "Unassigned"}
                        </td>
                        <td>
                          {item.createdBy ? (
                            <>
                              <strong>{item.createdBy.name}</strong>
                              <small>{positionLabel(item.createdBy.position)}</small>
                            </>
                          ) : "—"}
                        </td>
                        <td>{formatDate(item.createdAt)}</td>
                        <td>{item.department}</td>
                        <td><span className={`work-items-priority priority-${item.priority.toLowerCase()}`}>{item.priority}</span></td>
                        <td className={overdue ? "is-overdue" : ""}>{formatDate(item.deadline)}</td>
                        <td><span className={`work-items-status status-${item.status.toLowerCase()}`}>{statusLabels[item.status] || item.status}</span></td>
                        <td><button type="button" className="work-items-view-row" onClick={() => setSelectedItem(item)}>View</button></td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10}>
                      <div className="work-items-empty">
                        <strong>No {filters.view} found</strong>
                        <span>Try changing or clearing the filters.</span>
                        <button type="button" onClick={clearFilters}>Clear filters</button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="work-items-pagination">
            <label>
              Rows
              <select
                value={filters.pageSize}
                onChange={(event) => updateFilters({ pageSize: Number(event.target.value) })}
              >
                {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <span>Page {filters.page} of {pageCount}</span>
            <button type="button" disabled={filters.page <= 1 || loading} onClick={() => updateFilters({ page: filters.page - 1 }, false)}>Previous</button>
            <button type="button" disabled={filters.page >= pageCount || loading} onClick={() => updateFilters({ page: filters.page + 1 }, false)}>Next</button>
          </div>
        </>
      )}

      {selectedItem && (
        <div className="work-items-dialog-backdrop" role="presentation" onClick={() => setSelectedItem(null)}>
          <section
            className="work-items-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-item-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="work-items-dialog-header">
              <div>
                <span className="work-items-id">{selectedItem.referenceId}</span>
                <h2 id="work-item-dialog-title">{selectedItem.title}</h2>
              </div>
              <button type="button" aria-label="Close details" onClick={() => setSelectedItem(null)}>×</button>
            </div>
            <dl>
              <div><dt>Assigned to</dt><dd>{selectedItem.assignedTo?.name || "Unassigned"}</dd></div>
              <div><dt>Created by</dt><dd>{selectedItem.createdBy?.name || "—"}</dd></div>
              <div><dt>Department</dt><dd>{selectedItem.department}</dd></div>
              <div><dt>Priority</dt><dd>{selectedItem.priority}</dd></div>
              <div><dt>Deadline</dt><dd>{formatDate(selectedItem.deadline)}</dd></div>
              <div><dt>Status</dt><dd>{selectedItem.rawStatus}</dd></div>
            </dl>
          </section>
        </div>
      )}
    </section>
  );
}
