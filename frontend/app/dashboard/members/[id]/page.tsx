"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";

interface Member {
  id: number;
  name: string;
  email: string;
  department: string;
  position: string;
  reportsToId: number | null;
  employeeId: string;
  isActive: boolean;
  joinedAt: string;
  lastActivityAt: string | null;
  reportsTo?: { id: number; name: string; position: string; department: string; employeeId: string } | null;
}
interface ReportingOption {
  id: number;
  name: string;
  position: string;
  department: string;
}

interface Task {
  id: number;
  title: string;
  status: string;
  priority: string;
  progress: number;
  dueDate: string;
  assignedTo: number | null;
  project?: { id: number; title: string } | null;
}

interface Overview {
  tasks: Task[];
  summary: {
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    overdue: number;
    completionRate: number;
    onTimeCompletionRate: number;
    averageCompletionDays: number | null;
  };
  page: number;
  pageSize: number;
  pageCount: number;
  taskCount: number;
  deadlineHistory: {
    id: number;
    oldDeadline: string | null;
    newDeadline: string;
    changedAt: string;
    reason: string;
    task?: { id: number; title: string };
    changedByUser?: { id: number; name: string };
  }[];
}

interface DeadlineRequest {
  id: number;
  taskId: number;
  currentDeadline: string;
  requestedDeadline: string;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  responseNote?: string | null;
  createdAt: string;
  requester?: { id: number; name: string; employeeId: string; position: string };
  task?: { id: number; title: string; dueDate: string; assignedTo: number };
}

const rank: Record<string, number> = {
  MANAGER: 5,
  SUB_MANAGER: 4,
  TEAM_LEAD: 3,
  EMPLOYEE: 2,
  INTERN: 1,
};

function dateAfterToday() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString();
}

function MemberDetails({ id }: { id: number }) {
  const { user } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [requests, setRequests] = useState<DeadlineRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [reportsToId, setReportsToId] = useState("");
  const [departments, setDepartments] = useState<string[]>([]);
  const [reportingOptions, setReportingOptions] = useState<ReportingOption[]>([]);
  const [requestTaskId, setRequestTaskId] = useState<number | null>(null);
  const [requestedDeadline, setRequestedDeadline] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [taskFilters, setTaskFilters] = useState({
    search: "",
    status: "",
    priority: "",
    startDate: "",
    endDate: "",
    page: 1,
  });
  const [filtersReady, setFiltersReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      setTaskFilters({
        search: params.get("search") || "",
        status: params.get("status") || "",
        priority: params.get("priority") || "",
        startDate: params.get("startDate") || "",
        endDate: params.get("endDate") || "",
        page: Math.max(1, Number(params.get("page") || 1)),
      });
      setFiltersReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [memberResponse, overviewResponse, requestsResponse] = await Promise.all([
        API.get(`/users/members/${id}`),
        API.get(`/users/${id}/overview`, {
          params: {
            search: taskFilters.search || undefined,
            startDate: taskFilters.startDate || undefined,
            endDate: taskFilters.endDate || undefined,
            page: taskFilters.page,
            pageSize: 10,
            ...(taskFilters.status ? { status: taskFilters.status } : {}),
            ...(taskFilters.priority ? { priority: taskFilters.priority } : {}),
          },
        }),
        API.get("/tasks/deadline-requests", { params: { assigneeId: id } }),
      ]);
      const nextMember = memberResponse.data.data.member as Member;
      setMember(nextMember);
      setName(nextMember.name);
      setIsActive(nextMember.isActive);
      setDepartment(nextMember.department);
      setPosition(nextMember.position);
      setReportsToId(nextMember.reportsToId ? String(nextMember.reportsToId) : "");
      setOverview(overviewResponse.data.data as Overview);
      setRequests(requestsResponse.data.data.requests as DeadlineRequest[]);
    } catch (loadError) {
      const message = (loadError as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(message || "Could not load this member's details.");
    } finally {
      setLoading(false);
    }
  }, [id, taskFilters]);

  useEffect(() => {
    if (!filtersReady) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [filtersReady, load]);

  useEffect(() => {
    if (!filtersReady) return;
    const params = new URLSearchParams(window.location.search);
    const values: Record<string, string> = {
      search: taskFilters.search.trim(),
      status: taskFilters.status,
      priority: taskFilters.priority,
      startDate: taskFilters.startDate,
      endDate: taskFilters.endDate,
      page: taskFilters.page > 1 ? String(taskFilters.page) : "",
    };
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [filtersReady, taskFilters]);

  useEffect(() => {
    if (!user || user.position !== "MANAGER") return;
    let active = true;
    API.get("/auth/registration-options")
      .then(({ data }) => {
        if (active) setDepartments(data.data.departments as string[]);
      })
      .catch(() => {
        if (active) toast.error("Could not load department options.");
      });
    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user || user.position !== "MANAGER" || !department || !position) return;
    if (position === "MANAGER") {
      const timer = window.setTimeout(() => {
        setReportingOptions([]);
        setReportsToId("");
      }, 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    API.get("/auth/reporting-options", { params: { department, position } })
      .then(({ data }) => {
        if (active) setReportingOptions(data.data.users as ReportingOption[]);
      })
      .catch(() => {
        if (active) toast.error("Could not load eligible reporting managers.");
      });
    return () => {
      active = false;
    };
  }, [department, position, user]);

  const canEditMember = useMemo(() => {
    if (!user || !member || user.id === member.id) return false;
    return user.position === "MANAGER" ||
      (user.department === member.department && rank[user.position] > rank[member.position]);
  }, [member, user]);

  const updateMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!member) return;
    setSavingMember(true);
    try {
      const body = user?.position === "MANAGER"
        ? {
          name,
          isActive,
          department,
          position,
          reportsToId: position === "MANAGER" ? null : Number(reportsToId),
        }
        : { name, isActive };
      const { data } = await API.patch(`/users/members/${member.id}`, body);
      setMember(data.data.member as Member);
      toast.success("Member details updated.");
    } catch (updateError) {
      toast.error((updateError as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not update member details.");
    } finally {
      setSavingMember(false);
    }
  };

  const submitDeadlineRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (requestTaskId === null) return;
    setSubmittingRequest(true);
    try {
      await API.post(`/tasks/${requestTaskId}/deadline-requests`, {
        requestedDeadline,
        reason: requestReason,
      });
      toast.success("Deadline extension request submitted.");
      setRequestTaskId(null);
      setRequestedDeadline("");
      setRequestReason("");
      await load();
    } catch (requestError) {
      toast.error((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not submit the request.");
    } finally {
      setSubmittingRequest(false);
    }
  };

  const reviewRequest = async (request: DeadlineRequest, decision: "APPROVED" | "REJECTED") => {
    setReviewingId(request.id);
    try {
      await API.put(`/tasks/deadline-requests/${request.id}`, { decision });
      toast.success(decision === "APPROVED" ? "Deadline extension approved." : "Deadline extension rejected.");
      await load();
    } catch (reviewError) {
      toast.error((reviewError as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not review this request.");
    } finally {
      setReviewingId(null);
    }
  };

  if (loading && !member) return <p className="p-8 text-sm t-text-muted">Loading member details…</p>;
  if (error && !member) return <div role="alert" className="rounded-xl border border-red-500/30 p-5 text-red-700">{error}</div>;
  if (!member || !overview) return null;

  const canReview = (task: Task) =>
    Boolean(
      user &&
      task.assignedTo &&
      (user.position === "MANAGER" ||
        (user.department === member.department &&
          rank[user.position] > rank[member.position])),
    );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm font-semibold text-indigo-600 hover:underline">← Dashboard</Link>
          <p className="mt-4 text-xs font-semibold uppercase tracking-widest text-indigo-600">{member.department} · {member.position}</p>
          <h1 className="mt-1 text-3xl font-bold t-text-primary">{member.name}</h1>
          <p className="mt-1 text-sm t-text-muted">{member.employeeId} · {member.email}</p>
        </div>
        {loading && <span className="text-sm t-text-muted">Refreshing…</span>}
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Tasks", overview.summary.total],
          ["Completed", overview.summary.completed],
          ["In progress", overview.summary.inProgress],
          ["Overdue", overview.summary.overdue],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border t-border-subtle t-bg-card p-4">
            <p className="text-xs t-text-muted">{label}</p>
            <p className="mt-1 text-2xl font-bold t-text-primary">{value}</p>
          </div>
        ))}
      </section>
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border t-border-subtle t-bg-card p-4">
          <p className="text-xs t-text-muted">On-time completion</p>
          <p className="mt-1 text-2xl font-bold t-text-primary">{overview.summary.onTimeCompletionRate}%</p>
        </div>
        <div className="rounded-xl border t-border-subtle t-bg-card p-4">
          <p className="text-xs t-text-muted">Average completion time</p>
          <p className="mt-1 text-2xl font-bold t-text-primary">
            {overview.summary.averageCompletionDays === null ? "—" : `${overview.summary.averageCompletionDays.toFixed(1)} days`}
          </p>
        </div>
      </section>

      {canEditMember && (
        <section className="rounded-2xl border t-border-subtle t-bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold t-text-primary">Update member</h2>
            {user?.position === "MANAGER" && member.isActive && (
              <Link href={`/dashboard?newTaskFor=${member.id}`} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                Create task for member
              </Link>
            )}
          </div>
          <form onSubmit={updateMember} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            {user?.position === "MANAGER" && <>
              <label className="text-sm font-medium t-text-muted">
                Department
                <select value={department} onChange={(event) => {
                  setDepartment(event.target.value);
                  setReportsToId("");
                }} className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 t-text-primary">
                  {departments.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="text-sm font-medium t-text-muted">
                Position
                <select value={position} onChange={(event) => {
                  setPosition(event.target.value);
                  setReportsToId("");
                }} className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 t-text-primary">
                  {Object.keys(rank).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}
                </select>
              </label>
              {position !== "MANAGER" && (
                <label className="text-sm font-medium t-text-muted">
                  Reports to
                  <select value={reportsToId} onChange={(event) => setReportsToId(event.target.value)} required
                    className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 t-text-primary">
                    <option value="">Select a manager</option>
                    {reportingOptions.map((option) => (
                      <option key={option.id} value={option.id}>{option.name} · {option.position.replaceAll("_", " ")} · {option.department}</option>
                    ))}
                  </select>
                </label>
              )}
            </>}
            <label className="text-sm font-medium t-text-muted">
              Display name
              <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={100} required
                className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 t-text-primary" />
            </label>
            <label className="flex items-center gap-2 text-sm t-text-primary">
              <input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />
              Account active
            </label>
            <button type="submit" disabled={savingMember} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {savingMember ? "Saving…" : "Save member"}
            </button>
          </form>
          <p className="mt-2 text-xs t-text-muted">Department, position, and reporting manager can be reassigned by Managers. Reporting links and open tasks are revalidated when the hierarchy changes.</p>
        </section>
      )}

      <section className="rounded-2xl border t-border-subtle t-bg-card p-5">
        <h2 className="text-lg font-semibold t-text-primary">Filter assigned tasks</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs font-medium t-text-muted">Search
            <input type="search" value={taskFilters.search} onChange={(event) => setTaskFilters((current) => ({ ...current, search: event.target.value, page: 1 }))}
              className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 text-sm t-text-primary" placeholder="Title, description, or ID" />
          </label>
          <label className="text-xs font-medium t-text-muted">Status
            <select value={taskFilters.status} onChange={(event) => setTaskFilters((current) => ({ ...current, status: event.target.value, page: 1 }))}
              className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 text-sm t-text-primary">
              <option value="">All statuses</option>
              {["Pending", "In-Progress", "Completed"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium t-text-muted">Priority
            <select value={taskFilters.priority} onChange={(event) => setTaskFilters((current) => ({ ...current, priority: event.target.value, page: 1 }))}
              className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 text-sm t-text-primary">
              <option value="">All priorities</option>
              {["Low", "Medium", "High", "Urgent"].map((item) => <option key={item}>{item}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium t-text-muted">Created from
            <input type="date" value={taskFilters.startDate} onChange={(event) => setTaskFilters((current) => ({ ...current, startDate: event.target.value, page: 1 }))}
              className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 text-sm t-text-primary" />
          </label>
          <label className="text-xs font-medium t-text-muted">Created through
            <input type="date" value={taskFilters.endDate} onChange={(event) => setTaskFilters((current) => ({ ...current, endDate: event.target.value, page: 1 }))}
              className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 text-sm t-text-primary" />
          </label>
        </div>
      </section>

      <section className="rounded-2xl border t-border-subtle t-bg-card p-5">
        <h2 className="text-lg font-semibold t-text-primary">Member details</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div><dt className="text-xs t-text-muted">Department</dt><dd className="mt-1 text-sm t-text-primary">{member.department}</dd></div>
          <div><dt className="text-xs t-text-muted">Position</dt><dd className="mt-1 text-sm t-text-primary">{member.position}</dd></div>
          <div><dt className="text-xs t-text-muted">Reports to</dt><dd className="mt-1 text-sm t-text-primary">{member.reportsTo ? `${member.reportsTo.name} (${member.reportsTo.position})` : "—"}</dd></div>
          <div><dt className="text-xs t-text-muted">Joined</dt><dd className="mt-1 text-sm t-text-primary">{member.joinedAt ? new Date(member.joinedAt).toLocaleDateString() : "—"}</dd></div>
          <div><dt className="text-xs t-text-muted">Last activity</dt><dd className="mt-1 text-sm t-text-primary">{member.lastActivityAt ? new Date(member.lastActivityAt).toLocaleString() : "—"}</dd></div>
          <div><dt className="text-xs t-text-muted">Account</dt><dd className="mt-1 text-sm t-text-primary">{member.isActive ? "Active" : "Inactive"}</dd></div>
        </dl>
      </section>

      <section className="rounded-2xl border t-border-subtle t-bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-lg font-semibold t-text-primary">Assigned tasks</h2><p className="text-sm t-text-muted">Request an extension when a task deadline needs to move.</p></div>
        </div>
        {!overview.tasks.length ? <div className="mt-4 rounded-lg bg-slate-500/5 p-5 text-sm t-text-muted">
          <p>No tasks match these filters.</p>
          <button type="button" className="mt-2 font-semibold text-indigo-600 underline"
            onClick={() => setTaskFilters({ search: "", status: "", priority: "", startDate: "", endDate: "", page: 1 })}>
            Clear filters
          </button>
        </div> : (
          <div className="mt-4 space-y-3">
            {overview.tasks.map((task) => {
              const taskRequests = requests.filter((request) => request.taskId === task.id);
              const pending = taskRequests.some((request) => request.status === "PENDING");
              const isAssignee = user?.id === task.assignedTo;
              return (
                <article key={task.id} className="rounded-xl border t-border-subtle p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold t-text-primary">#{task.id} · {task.title}</h3>
                      <p className="mt-1 text-xs t-text-muted">{task.project?.title || "No project"} · {task.status} · {task.progress}% · Due {formatDate(task.dueDate)}</p>
                    </div>
                    {isAssignee && task.status !== "Completed" && task.status !== "DONE" && (
                      <button type="button" disabled={pending} onClick={() => setRequestTaskId(requestTaskId === task.id ? null : task.id)}
                        className="rounded-lg border t-border-subtle px-3 py-2 text-xs font-semibold t-text-primary disabled:opacity-50">
                        {pending ? "Request pending" : requestTaskId === task.id ? "Cancel request" : "Request deadline extension"}
                      </button>
                    )}
                  </div>
                  {requestTaskId === task.id && (
                    <form onSubmit={submitDeadlineRequest} className="mt-4 grid gap-3 md:grid-cols-[200px_1fr_auto] md:items-end">
                      <label className="text-xs font-medium t-text-muted">New requested deadline
                        <input type="date" min={dateAfterToday()} value={requestedDeadline} onChange={(event) => setRequestedDeadline(event.target.value)} required
                          className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 text-sm t-text-primary" />
                      </label>
                      <label className="text-xs font-medium t-text-muted">Reason
                        <input value={requestReason} onChange={(event) => setRequestReason(event.target.value)} minLength={5} maxLength={2000} required
                          className="mt-1 w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 text-sm t-text-primary" />
                      </label>
                      <button type="submit" disabled={submittingRequest} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{submittingRequest ? "Submitting…" : "Submit request"}</button>
                    </form>
                  )}
                  {taskRequests.map((request) => (
                    <div key={request.id} className="mt-3 rounded-lg bg-slate-500/5 p-3 text-sm">
                      <p className="font-medium t-text-primary">{request.status}: {formatDate(request.currentDeadline)} → {formatDate(request.requestedDeadline)}</p>
                      <p className="mt-1 t-text-muted">{request.reason}</p>
                      {request.responseNote && <p className="mt-1 text-xs t-text-muted">Review note: {request.responseNote}</p>}
                      {request.status === "PENDING" && canReview(task) && (
                        <div className="mt-3 flex gap-2">
                          <button type="button" disabled={reviewingId === request.id} onClick={() => void reviewRequest(request, "APPROVED")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Approve</button>
                          <button type="button" disabled={reviewingId === request.id} onClick={() => void reviewRequest(request, "REJECTED")} className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Reject</button>
                        </div>
                      )}
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        )}
        {overview.taskCount > overview.pageSize && (
          <div className="mt-4 flex items-center justify-between text-sm t-text-muted">
            <span>{overview.taskCount} matching tasks · Page {overview.page} of {overview.pageCount}</span>
            <div className="flex gap-2">
              <button type="button" disabled={overview.page <= 1}
                onClick={() => setTaskFilters((current) => ({ ...current, page: current.page - 1 }))}
                className="rounded-lg border t-border-subtle px-3 py-1.5 disabled:opacity-40">Previous</button>
              <button type="button" disabled={overview.page >= overview.pageCount}
                onClick={() => setTaskFilters((current) => ({ ...current, page: current.page + 1 }))}
                className="rounded-lg border t-border-subtle px-3 py-1.5 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-2xl border t-border-subtle t-bg-card p-5">
        <h2 className="text-lg font-semibold t-text-primary">Deadline history</h2>
        {!overview.deadlineHistory.length ? <p className="mt-3 text-sm t-text-muted">No deadline changes recorded.</p> : (
          <ol className="mt-4 space-y-3">
            {overview.deadlineHistory.map((item) => (
              <li key={item.id} className="rounded-lg border t-border-subtle p-3 text-sm">
                <p className="font-semibold t-text-primary">{item.task?.title || "Task"}: {formatDate(item.oldDeadline)} → {formatDate(item.newDeadline)}</p>
                <p className="mt-1 t-text-muted">{item.reason}</p>
                <p className="mt-1 text-xs t-text-muted">{item.changedByUser?.name || "Supervisor"} · {new Date(item.changedAt).toLocaleString()}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export default function MemberDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  if (!Number.isSafeInteger(id) || id < 1) {
    return <ProtectedRoute><p className="p-8 text-sm text-red-600">Invalid member ID.</p></ProtectedRoute>;
  }
  return <ProtectedRoute><main className="min-h-screen bg-surface-primary px-4 py-8 sm:px-6 lg:px-8"><MemberDetails id={id} /></main></ProtectedRoute>;
}
