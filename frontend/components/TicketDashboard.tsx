"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import SkeletonLoader from "@/components/SkeletonLoader";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

type Priority = "P0" | "P1" | "P2";
type TicketStatus = "Open" | "In-Progress" | "Resolved" | "Closed";
type TicketSort = "newest" | "oldest" | "priority" | "deadline";
type DetailTab = "details" | "activity" | "comments";

interface UserRef {
  id: number;
  name: string;
  email?: string;
  team?: string;
}

interface HistoryEntry {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  action: string;
  createdAt: string;
  changedByUser?: UserRef;
}

interface TicketComment {
  id: number;
  comment: string;
  createdAt: string;
  user: UserRef;
}

interface Attachment {
  id: number;
  filename?: string;
  originalName?: string;
  fileName?: string;
  mimetype?: string;
  mimeType?: string;
  size?: number;
  fileSize?: number;
  createdAt: string;
  uploader?: UserRef;
}

interface LinkedRecord {
  id: number;
  name?: string;
  title?: string;
  projectId?: number;
}

interface Ticket {
  id: number;
  title: string;
  description?: string;
  screenshotUrl?: string;
  priority: Priority;
  status: TicketStatus;
  department: string;
  rootCause?: string;
  resolutionNote?: string;
  deadline?: string | null;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string | null;
  resolvedBy?: UserRef | null;
  resolver?: UserRef | null;
  creator?: UserRef;
  assignee?: UserRef | null;
  assignedTo?: number | null;
  comments?: TicketComment[];
  history?: HistoryEntry[];
  attachments?: Attachment[];
  project?: LinkedRecord | null;
  task?: LinkedRecord | null;
  relatedTask?: LinkedRecord | null;
  projectId?: number | null;
  taskId?: number | null;
}

interface Department {
  name?: string;
  department?: string;
}

interface Summary {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  overdue: number;
}

interface TicketListData {
  tickets: Ticket[];
  totalFiltered: number;
  totalAbsolute: number;
  summary: Summary;
  departments: Array<string | Department>;
  page?: number;
  pageSize?: number;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data: T;
  message?: string;
}

interface NotificationItem {
  id: number;
  title?: string;
  message?: string;
  read?: boolean;
  isRead?: boolean;
  readAt?: string | null;
  createdAt: string;
  ticketId?: number;
  link?: string;
}

const priorityClass: Record<Priority, string> = {
  P0: "border-red-500/30 bg-red-500/10 text-red-600",
  P1: "border-orange-500/30 bg-orange-500/10 text-orange-600",
  P2: "border-sky-500/30 bg-sky-500/10 text-sky-600",
};

const statusClass: Record<TicketStatus, string> = {
  Open: "bg-emerald-600 text-white",
  "In-Progress": "bg-sky-600 text-white",
  Resolved: "bg-violet-600 text-white",
  Closed: "bg-slate-500 text-white",
};

const emptySummary: Summary = {
  total: 0,
  open: 0,
  inProgress: 0,
  resolved: 0,
  closed: 0,
  overdue: 0,
};

function errorMessage(error: unknown, fallback: string): string {
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
  return fallback;
}

function dateLabel(value?: string | null): string {
  if (!value) return "—";
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, year, month, day] = dateOnly;
    return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function dateInputValue(value?: string | null): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function TicketDashboard() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [members, setMembers] = useState<UserRef[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [projects, setProjects] = useState<LinkedRecord[]>([]);
  const [tasks, setTasks] = useState<LinkedRecord[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [totalFiltered, setTotalFiltered] = useState(0);
  const [totalAbsolute, setTotalAbsolute] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [viewFilter, setViewFilter] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState<TicketSort>("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const listRequestId = useRef(0);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [viewTicket, setViewTicket] = useState<Ticket | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("details");
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    screenshotUrl: "",
    priority: "P2" as Priority,
    department: "",
    assignedTo: "",
    deadline: "",
    projectId: "",
    taskId: "",
  });
  const [commentText, setCommentText] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [showReopenForm, setShowReopenForm] = useState(false);
  const [deadlineValue, setDeadlineValue] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notificationItems, setNotificationItems] = useState<NotificationItem[]>([]);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationError, setNotificationError] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const dark = isDark;
  const panelClass = dark
    ? "border-slate-700 bg-slate-900 text-slate-100"
    : "border-slate-200 bg-white text-slate-900";
  const mutedClass = dark ? "text-slate-400" : "text-slate-600";
  const inputClass = `w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 ${
    dark
      ? "border-slate-700 bg-slate-950 text-slate-100 placeholder:text-slate-500"
      : "border-slate-300 bg-white text-slate-900 placeholder:text-slate-400"
  }`;
  const buttonClass =
    "rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800";

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const requestId = ++listRequestId.current;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort,
    });
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (priorityFilter) params.set("priority", priorityFilter);
    if (departmentFilter) params.set("department", departmentFilter);
    if (assigneeFilter) params.set("assignee", assigneeFilter);
    if (viewFilter) params.set("view", viewFilter);
    if (overdueOnly) params.set("overdue", "true");
    try {
      const response = await API.get<ApiEnvelope<TicketListData>>(`/tickets?${params.toString()}`);
      if (requestId !== listRequestId.current) return;
      const result = response.data.data;
      setTickets(result.tickets || []);
      setTotalFiltered(result.totalFiltered ?? result.tickets?.length ?? 0);
      setTotalAbsolute(result.totalAbsolute ?? 0);
      setSummary({ ...emptySummary, ...result.summary });
      if (result.departments) {
        setDepartments(
          result.departments
            .map((item) => (typeof item === "string" ? item : item.name || item.department || ""))
            .filter(Boolean),
        );
      }
    } catch (error: unknown) {
      if (requestId !== listRequestId.current) return;
      setLoadError(errorMessage(error, "Unable to load tickets. Please try again."));
      setTickets([]);
    } finally {
      if (requestId === listRequestId.current) setLoading(false);
    }
  }, [
    page,
    pageSize,
    sort,
    debouncedSearch,
    statusFilter,
    priorityFilter,
    departmentFilter,
    assigneeFilter,
    viewFilter,
    overdueOnly,
  ]);

  const fetchMembers = useCallback(async () => {
    try {
      const response = await API.get<ApiEnvelope<{ members: UserRef[] }>>("/users/members");
      setMembers(response.data.data.members || []);
    } catch {
      toast.error("Could not load ticket assignees.");
    }
  }, []);

  const fetchLinkedRecords = useCallback(async () => {
    try {
      const [projectResponse, taskResponse] = await Promise.all([
        API.get<ApiEnvelope<{ projects: LinkedRecord[] }>>("/projects"),
        API.get<ApiEnvelope<{ tasks: LinkedRecord[] }>>("/tasks"),
      ]);
      setProjects(projectResponse.data.data.projects || []);
      setTasks(taskResponse.data.data.tasks || []);
    } catch {
      // Linked records are optional for ticket creation.
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const response = await API.get<ApiEnvelope<{ notifications: NotificationItem[]; unreadCount: number }>>("/users/notifications");
      setNotificationItems(response.data.data.notifications || []);
      setNotificationUnreadCount(response.data.data.unreadCount || 0);
      setNotificationError("");
    } catch (error: unknown) {
      setNotificationError(errorMessage(error, "Unable to load notifications."));
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchTickets(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchTickets]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetchMembers();
      void fetchLinkedRecords();
      void fetchNotifications();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [fetchMembers, fetchLinkedRecords, fetchNotifications]);

  const refreshTicketDetail = useCallback(async (ticketId: number) => {
    try {
      const response = await API.get<ApiEnvelope<{ ticket: Ticket }>>(`/tickets/${ticketId}`);
      const ticket = response.data.data.ticket;
      setViewTicket(ticket);
      setDeadlineValue(dateInputValue(ticket.deadline));
      setTickets((current) => current.map((item) => (item.id === ticket.id ? { ...item, ...ticket } : item)));
    } catch {
      toast.error("Unable to refresh ticket details.");
    }
  }, []);

  const openTicket = async (ticket: Ticket) => {
    setViewTicket(ticket);
    setDetailTab("details");
    setCommentText("");
    setDeadlineValue(dateInputValue(ticket.deadline));
    setDetailLoading(true);
    try {
      const response = await API.get<ApiEnvelope<{ ticket: Ticket }>>(`/tickets/${ticket.id}`);
      const detail = response.data.data.ticket;
      setViewTicket(detail);
      setDeadlineValue(dateInputValue(detail.deadline));
    } catch {
      toast.error("Could not load full ticket details.");
    } finally {
      setDetailLoading(false);
    }
  };

  const openTicketById = async (ticketId: number) => {
    setDetailLoading(true);
    setDetailTab("details");
    try {
      const response = await API.get<ApiEnvelope<{ ticket: Ticket }>>(`/tickets/${ticketId}`);
      const ticket = response.data.data.ticket;
      setViewTicket(ticket);
      setDeadlineValue(dateInputValue(ticket.deadline));
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Could not open the linked ticket."));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCreateTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!createForm.title.trim() || !createForm.department.trim()) {
      toast.error("Ticket title and department are required.");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        screenshotUrl: createForm.screenshotUrl.trim() || undefined,
        priority: createForm.priority,
        department: createForm.department.trim(),
        assignedTo: createForm.assignedTo ? Number(createForm.assignedTo) : null,
        deadline: createForm.deadline || undefined,
        projectId: createForm.projectId ? Number(createForm.projectId) : undefined,
        taskId: createForm.taskId ? Number(createForm.taskId) : undefined,
      };
      await API.post("/tickets", body);
      toast.success("Ticket created.");
      setShowCreateModal(false);
      setCreateForm({
        title: "",
        description: "",
        screenshotUrl: "",
        priority: "P2",
        department: "",
        assignedTo: "",
        deadline: "",
        projectId: "",
        taskId: "",
      });
      await fetchTickets();
      await fetchNotifications();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Could not create ticket."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!viewTicket || !commentText.trim()) return;
    setSubmitting(true);
    try {
      await API.post(`/tickets/${viewTicket.id}/comments`, { comment: commentText.trim() });
      setCommentText("");
      await refreshTicketDetail(viewTicket.id);
      await fetchTickets();
      await fetchNotifications();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Could not add comment."));
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (ticket: Ticket, nextStatus: "In-Progress" | "Resolved" | "Closed") => {
    const note = nextStatus === "Resolved" ? resolutionNote.trim() : undefined;
    if (nextStatus === "Resolved" && !note) {
      toast.error("Add a resolution note before resolving this ticket.");
      return;
    }
    setSubmitting(true);
    try {
      await API.put(`/tickets/${ticket.id}/status`, {
        status: nextStatus,
        ...(note ? { resolutionNote: note } : {}),
      });
      setResolutionNote("");
      toast.success(`Ticket marked ${nextStatus.toLowerCase()}.`);
      await refreshTicketDetail(ticket.id);
      await fetchTickets();
      await fetchNotifications();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Could not update ticket status."));
    } finally {
      setSubmitting(false);
    }
  };

  const updateAssignee = async (ticket: Ticket, value: string) => {
    setSubmitting(true);
    try {
      await API.put(`/tickets/${ticket.id}/assignee`, {
        assignedTo: value ? Number(value) : null,
      });
      toast.success("Assignee updated.");
      await refreshTicketDetail(ticket.id);
      await fetchTickets();
      await fetchNotifications();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Could not update assignee."));
    } finally {
      setSubmitting(false);
    }
  };

  const updateDeadline = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!viewTicket) return;
    setSubmitting(true);
    try {
      await API.put(`/tickets/${viewTicket.id}/deadline`, {
        deadline: deadlineValue || null,
      });
      toast.success("Deadline updated.");
      await refreshTicketDetail(viewTicket.id);
      await fetchTickets();
      await fetchNotifications();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Could not update deadline."));
    } finally {
      setSubmitting(false);
    }
  };

  const reopenTicket = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!viewTicket || !reopenReason.trim()) {
      toast.error("Enter a reason for reopening this ticket.");
      return;
    }
    setSubmitting(true);
    try {
      await API.put(`/tickets/${viewTicket.id}/reopen`, { reason: reopenReason.trim() });
      setReopenReason("");
      setShowReopenForm(false);
      toast.success("Ticket reopened.");
      await refreshTicketDetail(viewTicket.id);
      await fetchTickets();
      await fetchNotifications();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Could not reopen ticket."));
    } finally {
      setSubmitting(false);
    }
  };

  const uploadAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !viewTicket) return;
    const formData = new FormData();
    formData.append("file", file);
    setUploadProgress(0);
    try {
      await API.post(`/tickets/${viewTicket.id}/attachments`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            setUploadProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
          }
        },
      });
      toast.success("Attachment uploaded.");
      await refreshTicketDetail(viewTicket.id);
      await fetchNotifications();
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Could not upload attachment."));
    } finally {
      setUploadProgress(null);
      input.value = "";
    }
  };

  const downloadAttachment = async (ticketId: number, attachment: Attachment) => {
    try {
      const response = await API.get(`/tickets/${ticketId}/attachments/${attachment.id}`, {
        responseType: "blob",
      });
      const objectUrl = URL.createObjectURL(response.data as Blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = attachment.originalName || attachment.fileName || attachment.filename || `attachment-${attachment.id}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Could not download attachment."));
    }
  };

  const previewAttachment = async (ticketId: number, attachment: Attachment) => {
    try {
      const response = await API.get(`/tickets/${ticketId}/attachments/${attachment.id}`, {
        responseType: "blob",
      });
      setPreviewUrl(URL.createObjectURL(response.data as Blob));
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Could not preview attachment."));
    }
  };

  const markNotificationRead = async (notification: NotificationItem) => {
    try {
      await API.patch(`/users/notifications/${notification.id}/read`);
      const wasUnread = !(notification.read ?? notification.isRead ?? Boolean(notification.readAt));
      setNotificationItems((items) =>
        items.map((item) => (item.id === notification.id ? { ...item, read: true, isRead: true, readAt: new Date().toISOString() } : item)),
      );
      if (wasUnread) setNotificationUnreadCount((count) => Math.max(0, count - 1));
    } catch (error: unknown) {
      toast.error(errorMessage(error, "Could not mark notification as read."));
    }
  };

  const unreadCount = notificationUnreadCount;
  const can = (permission: string) => Boolean(user?.permissions.includes(permission));
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const canAssignTickets = can("ticket:assign");
  const canWorkOnTicket = (ticket: Ticket) =>
    isAdmin || Number(ticket.assignedTo ?? ticket.assignee?.id) === Number(user?.id);
  const canCloseTicket = (ticket: Ticket) =>
    isAdmin || Number(ticket.creator?.id) === Number(user?.id);
  const availableTasks = useMemo(
    () => tasks.filter((task) => !createForm.projectId || String(task.projectId ?? "") === createForm.projectId),
    [tasks, createForm.projectId],
  );
  const pageCount = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const visibleStart = totalFiltered ? (page - 1) * pageSize + 1 : 0;
  const visibleEnd = Math.min(page * pageSize, totalFiltered);
  const pageButtons = useMemo(() => {
    const start = Math.max(1, Math.min(page - 2, pageCount - 4));
    return Array.from({ length: Math.min(5, pageCount) }, (_, index) => start + index);
  }, [page, pageCount]);

  const summaryCards: Array<{ label: string; value: number; tone: string; onClick: () => void }> = [
    { label: "All tickets", value: summary.total, tone: "text-brand-600", onClick: () => { setStatusFilter(""); setOverdueOnly(false); setPage(1); } },
    { label: "Open", value: summary.open, tone: "text-emerald-600", onClick: () => { setStatusFilter("Open"); setOverdueOnly(false); setPage(1); } },
    { label: "In progress", value: summary.inProgress, tone: "text-sky-600", onClick: () => { setStatusFilter("In-Progress"); setOverdueOnly(false); setPage(1); } },
    { label: "Resolved", value: summary.resolved, tone: "text-violet-600", onClick: () => { setStatusFilter("Resolved"); setOverdueOnly(false); setPage(1); } },
    { label: "Closed", value: summary.closed, tone: "text-slate-500", onClick: () => { setStatusFilter("Closed"); setOverdueOnly(false); setPage(1); } },
    { label: "Overdue", value: summary.overdue, tone: "text-red-600", onClick: () => { setStatusFilter(""); setOverdueOnly(true); setPage(1); } },
  ];
  const linkedTask = viewTicket?.task || viewTicket?.relatedTask;
  const resolvedBy = viewTicket?.resolvedBy || viewTicket?.resolver;

  return (
    <section className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {summaryCards.map((card) => (
          <button key={card.label} type="button" onClick={card.onClick} aria-label={`Filter tickets: ${card.label}`} className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${panelClass}`}>
            <p className={`text-xs font-semibold ${mutedClass}`}>{card.label}</p>
            <p className={`mt-2 text-2xl font-black ${card.tone}`}>{card.value}</p>
          </button>
        ))}
      </div>

      <div className={`overflow-hidden rounded-3xl border shadow-sm ${panelClass}`}>
        <header className={`flex flex-col gap-4 border-b p-4 sm:p-5 lg:flex-row lg:items-center ${dark ? "border-slate-700" : "border-slate-200"}`}>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-black tracking-tight">Ticket dashboard</h1>
              <p className={`mt-0.5 text-xs ${mutedClass}`}>Track requests, owners, deadlines, and updates.</p>
            </div>
            <input
              type="search"
              aria-label="Search tickets"
              placeholder="Search by ticket ID or title"
              value={searchTerm}
              onChange={(event) => {
                setPage(1);
                setSearchTerm(event.target.value);
              }}
              className={`${inputClass} min-w-44 flex-1 sm:max-w-sm`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <button type="button" className={buttonClass} onClick={() => setNotificationsOpen((open) => !open)}>
                Notifications{unreadCount ? ` (${unreadCount})` : ""}
              </button>
              {notificationsOpen && (
                <div className={`absolute right-0 top-12 z-30 max-h-80 w-80 overflow-auto rounded-2xl border p-2 shadow-xl ${panelClass}`}>
                  {notificationError ? (
                    <p role="alert" className="p-3 text-sm text-red-600">{notificationError}</p>
                  ) : !notificationItems.length ? (
                    <p className={`p-3 text-sm ${mutedClass}`}>No notifications.</p>
                  ) : notificationItems.map((notification) => {
                    const read = notification.read ?? notification.isRead ?? Boolean(notification.readAt);
                    return (
                      <button
                        type="button"
                        key={notification.id}
                        onClick={() => {
                          void markNotificationRead(notification);
                          const linkedId = notification.ticketId || Number(notification.link?.match(/[?&]ticket=(\d+)/)?.[1]);
                          if (linkedId) {
                            setNotificationsOpen(false);
                            const ticket = tickets.find((item) => item.id === notification.ticketId);
                            if (ticket && ticket.id === linkedId) void openTicket(ticket);
                            else void openTicketById(linkedId);
                          }
                        }}
                        className={`block w-full rounded-xl p-3 text-left hover:bg-slate-100 dark:hover:bg-slate-800 ${read ? "opacity-70" : ""}`}
                      >
                        <span className="block text-sm font-semibold">{notification.title || notification.message || "Ticket notification"}</span>
                        {notification.title && notification.message && <span className={`mt-1 block text-xs ${mutedClass}`}>{notification.message}</span>}
                        <span className={`mt-1 block text-[11px] ${mutedClass}`}>{dateLabel(notification.createdAt)}{read ? " · Read" : " · Unread"}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {can("ticket:create") && <button type="button" onClick={() => setShowCreateModal(true)} className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white shadow transition hover:bg-brand-700">+ New ticket</button>}
          </div>
        </header>

        <div className={`grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 ${dark ? "border-slate-700" : "border-slate-200"}`}>
          <select aria-label="Filter by status" className={inputClass} value={statusFilter} onChange={(event) => { setPage(1); setStatusFilter(event.target.value); }}>
            <option value="">All statuses</option>
            <option value="Open">Open</option>
            <option value="In-Progress">In progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
          <select aria-label="Filter by priority" className={inputClass} value={priorityFilter} onChange={(event) => { setPage(1); setPriorityFilter(event.target.value); }}>
            <option value="">All priorities</option>
            <option value="P0">P0 · Critical</option>
            <option value="P1">P1 · High</option>
            <option value="P2">P2 · Normal</option>
          </select>
          <select aria-label="Filter by department" className={inputClass} value={departmentFilter} onChange={(event) => { setPage(1); setDepartmentFilter(event.target.value); }}>
            <option value="">All departments</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
          <select aria-label="Filter by assignee" className={inputClass} value={assigneeFilter} onChange={(event) => { setPage(1); setAssigneeFilter(event.target.value); }}>
            <option value="">Any assignee</option>
            <option value="unassigned">Unassigned</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
          <select aria-label="Filter by ticket view" className={inputClass} value={viewFilter} onChange={(event) => { setPage(1); setViewFilter(event.target.value); }}>
            <option value="">All tickets</option>
            <option value="assigned">Assigned to me</option>
            <option value="created">Created by me</option>
          </select>
          <select aria-label="Sort tickets" className={inputClass} value={sort} onChange={(event) => { setPage(1); setSort(event.target.value as TicketSort); }}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="priority">Priority</option>
            <option value="deadline">Deadline</option>
          </select>
          <label className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${dark ? "border-slate-700" : "border-slate-300"}`}>
            <input type="checkbox" checked={overdueOnly} onChange={(event) => { setPage(1); setOverdueOnly(event.target.checked); }} />
            Overdue only
          </label>
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setSearchTerm("");
              setStatusFilter("");
              setPriorityFilter("");
              setDepartmentFilter("");
              setAssigneeFilter("");
              setViewFilter("");
              setOverdueOnly(false);
              setSort("newest");
            }}
            className={buttonClass}
          >
            Clear filters
          </button>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-5"><SkeletonLoader count={5} /></div>
          ) : loadError ? (
            <div className="p-12 text-center">
              <p className="font-semibold text-red-600">{loadError}</p>
              <button type="button" onClick={() => void fetchTickets()} className={`${buttonClass} mt-4`}>Try again</button>
            </div>
          ) : tickets.length === 0 ? (
            <div className={`p-14 text-center ${mutedClass}`}>
              <p className="text-lg font-bold">No tickets found</p>
              <p className="mt-1 text-sm">Try another search or clear some filters.</p>
            </div>
          ) : (
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className={`text-[11px] uppercase tracking-wider ${dark ? "bg-slate-800 text-slate-300" : "bg-slate-50 text-slate-600"}`}>
                <tr>
                  <th className="px-5 py-3 font-bold">Ticket</th>
                  <th className="px-4 py-3 font-bold">Requester</th>
                  <th className="px-4 py-3 font-bold">Department</th>
                  <th className="px-4 py-3 font-bold">Assignee</th>
                  <th className="px-4 py-3 font-bold">Priority</th>
                  <th className="px-4 py-3 font-bold">Status</th>
                  <th className="px-4 py-3 font-bold">Deadline</th>
                  <th className="px-4 py-3 font-bold">Created</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${dark ? "divide-slate-800" : "divide-slate-100"}`}>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => void openTicket(ticket)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void openTicket(ticket);
                    }}
                    tabIndex={0}
                    className={`cursor-pointer transition hover:bg-brand-500/5 ${dark ? "focus:bg-slate-800" : "focus:bg-slate-50"}`}
                  >
                    <td className="max-w-sm px-5 py-4">
                      <span className={`block font-mono text-[11px] ${mutedClass}`}>#{ticket.id}</span>
                      <span className="block truncate font-bold">{ticket.title}</span>
                      {ticket.project && <span className={`mt-1 block truncate text-xs ${mutedClass}`}>Project: {ticket.project.name || ticket.project.title}</span>}
                    </td>
                    <td className="px-4 py-4">{ticket.creator?.name || "—"}</td>
                    <td className="px-4 py-4">{ticket.department || "—"}</td>
                    <td className="px-4 py-4">{ticket.assignee?.name || "Unassigned"}</td>
                    <td className="px-4 py-4"><span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${priorityClass[ticket.priority]}`}>{ticket.priority}</span></td>
                    <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass[ticket.status]}`}>{ticket.status}</span></td>
                    <td className={`px-4 py-4 text-xs ${mutedClass}`}>{dateLabel(ticket.deadline)}</td>
                    <td className={`px-4 py-4 text-xs ${mutedClass}`}>{dateLabel(ticket.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <footer className={`flex flex-col gap-3 border-t p-4 text-sm sm:flex-row sm:items-center ${dark ? "border-slate-700" : "border-slate-200"}`}>
          <p className={`mr-auto ${mutedClass}`}>
            Showing {visibleStart}–{visibleEnd} of {totalFiltered} filtered · {totalAbsolute} total
          </p>
          <label className={`flex items-center gap-2 ${mutedClass}`}>
            Rows
            <select className={`${inputClass} w-auto py-1.5`} value={pageSize} onChange={(event) => { setPage(1); setPageSize(Number(event.target.value)); }}>
              {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <nav aria-label="Ticket pages" className="flex items-center gap-1">
            <button type="button" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} className={buttonClass}>‹</button>
            {pageButtons.map((number) => (
              <button key={number} type="button" aria-current={page === number ? "page" : undefined} onClick={() => setPage(number)} className={`min-w-9 rounded-xl px-3 py-2 text-sm font-semibold ${page === number ? "bg-brand-600 text-white" : buttonClass}`}>
                {number}
              </button>
            ))}
            <button type="button" aria-label="Next page" disabled={page >= pageCount || loading} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} className={buttonClass}>›</button>
          </nav>
        </footer>
      </div>

      {showCreateModal && can("ticket:create") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreateModal(false); }}>
          <div className={`my-auto max-h-[95vh] w-full max-w-2xl overflow-y-auto rounded-3xl border p-5 shadow-2xl sm:p-7 ${panelClass}`}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div><h2 className="text-xl font-black">Create ticket</h2><p className={`mt-1 text-sm ${mutedClass}`}>Provide the issue details and optionally link project work.</p></div>
              <button type="button" aria-label="Close" onClick={() => setShowCreateModal(false)} className={buttonClass}>✕</button>
            </div>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <label className="block text-xs font-bold">Title *
                <input required className={`${inputClass} mt-1.5`} value={createForm.title} onChange={(event) => setCreateForm((current) => ({ ...current, title: event.target.value }))} />
              </label>
              <label className="block text-xs font-bold">Description
                <textarea className={`${inputClass} mt-1.5 min-h-28 resize-y`} value={createForm.description} onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-xs font-bold">Department *
                  {departments.length ? (
                    <select required className={`${inputClass} mt-1.5`} value={createForm.department} onChange={(event) => setCreateForm((current) => ({ ...current, department: event.target.value }))}>
                      <option value="">Select department</option>
                      {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                    </select>
                  ) : <input required className={`${inputClass} mt-1.5`} value={createForm.department} onChange={(event) => setCreateForm((current) => ({ ...current, department: event.target.value }))} />}
                </label>
                <label className="block text-xs font-bold">Priority
                  <select className={`${inputClass} mt-1.5`} value={createForm.priority} onChange={(event) => setCreateForm((current) => ({ ...current, priority: event.target.value as Priority }))}>
                    <option value="P0">P0 · Critical</option><option value="P1">P1 · High</option><option value="P2">P2 · Normal</option>
                  </select>
                </label>
                <label className="block text-xs font-bold">Assign to
                  <select disabled={!canAssignTickets} className={`${inputClass} mt-1.5`} value={createForm.assignedTo} onChange={(event) => setCreateForm((current) => ({ ...current, assignedTo: event.target.value }))}>
                    <option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold">Deadline (optional)
                  <input type="date" className={`${inputClass} mt-1.5`} value={createForm.deadline} onChange={(event) => setCreateForm((current) => ({ ...current, deadline: event.target.value }))} />
                </label>
                <label className="block text-xs font-bold">Screenshot URL
                  <input type="url" className={`${inputClass} mt-1.5`} value={createForm.screenshotUrl} onChange={(event) => setCreateForm((current) => ({ ...current, screenshotUrl: event.target.value }))} placeholder="https://" />
                </label>
                <label className="block text-xs font-bold">Project (optional)
                  <select className={`${inputClass} mt-1.5`} value={createForm.projectId} onChange={(event) => setCreateForm((current) => ({ ...current, projectId: event.target.value, taskId: "" }))}>
                    <option value="">No project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name || project.title || `Project ${project.id}`}</option>)}
                  </select>
                </label>
                <label className="block text-xs font-bold">Task (optional)
                  <select className={`${inputClass} mt-1.5`} value={createForm.taskId} onChange={(event) => setCreateForm((current) => ({ ...current, taskId: event.target.value }))}>
                    <option value="">No task</option>{availableTasks.map((task) => <option key={task.id} value={task.id}>{task.title || task.name || `Task ${task.id}`}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className={buttonClass} onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" disabled={submitting} className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{submitting ? "Creating…" : "Create ticket"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-3 sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewTicket(null); }}>
          <div className={`my-auto flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border shadow-2xl ${panelClass}`}>
            <header className={`flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-6 ${dark ? "border-slate-700" : "border-slate-200"}`}>
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${statusClass[viewTicket.status]}`}>{viewTicket.status}</span>
                  <span className={`font-mono text-xs ${mutedClass}`}>Ticket #{viewTicket.id}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${priorityClass[viewTicket.priority]}`}>{viewTicket.priority}</span>
                </div>
                <h2 className="truncate text-lg font-black sm:text-xl">{viewTicket.title}</h2>
              </div>
              <button type="button" aria-label="Close details" className={buttonClass} onClick={() => setViewTicket(null)}>✕</button>
            </header>
            <nav className={`flex border-b px-4 ${dark ? "border-slate-700" : "border-slate-200"}`}>
              {(["details", "activity", "comments"] as DetailTab[]).map((tab) => (
                <button type="button" key={tab} onClick={() => setDetailTab(tab)} className={`border-b-2 px-4 py-3 text-sm font-semibold capitalize ${detailTab === tab ? "border-brand-600 text-brand-600" : `border-transparent ${mutedClass}`}`}>
                  {tab}{tab === "comments" && viewTicket.comments?.length ? ` (${viewTicket.comments.length})` : ""}
                </button>
              ))}
            </nav>
            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
              {detailLoading ? <div className="py-12"><SkeletonLoader count={3} /></div> : detailTab === "details" ? (
                <div className="space-y-6">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {[
                      ["Requester", viewTicket.creator?.name || "—"],
                      ["Department", viewTicket.department],
                      ["Created", dateLabel(viewTicket.createdAt)],
                      ["Deadline", dateLabel(viewTicket.deadline)],
                      ["Resolved", dateLabel(viewTicket.resolvedAt)],
                      ["Resolved by", resolvedBy?.name || "—"],
                    ].map(([label, value]) => (
                      <div key={label} className={`rounded-2xl border p-3 ${dark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
                        <p className={`text-[11px] font-bold uppercase ${mutedClass}`}>{label}</p><p className="mt-1 text-sm font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    {canAssignTickets && <label className="block text-xs font-bold">Assignee
                      <select disabled={submitting} className={`${inputClass} mt-1.5`} value={viewTicket.assignedTo ?? viewTicket.assignee?.id ?? ""} onChange={(event) => void updateAssignee(viewTicket, event.target.value)}>
                        <option value="">Unassigned</option>{members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
                      </select>
                    </label>}
                    {canAssignTickets && <form onSubmit={updateDeadline} className="flex items-end gap-2">
                      <label className="block min-w-0 flex-1 text-xs font-bold">Deadline
                        <input type="date" className={`${inputClass} mt-1.5`} value={deadlineValue.slice(0, 10)} onChange={(event) => setDeadlineValue(event.target.value)} />
                      </label>
                      <button type="submit" disabled={submitting} className={buttonClass}>Save</button>
                    </form>}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {viewTicket.project && (
                      <a href={`/projects/${viewTicket.project.id}`} className={`rounded-2xl border p-4 hover:border-brand-500 ${dark ? "border-slate-700" : "border-slate-200"}`}>
                        <span className={`block text-xs font-bold uppercase ${mutedClass}`}>Linked project</span>
                        <span className="mt-1 block font-semibold">{viewTicket.project.name || viewTicket.project.title || `Project #${viewTicket.project.id}`} ↗</span>
                      </a>
                    )}
                    {linkedTask && (
                      <a href={`/tasks/${linkedTask.id}`} className={`rounded-2xl border p-4 hover:border-brand-500 ${dark ? "border-slate-700" : "border-slate-200"}`}>
                        <span className={`block text-xs font-bold uppercase ${mutedClass}`}>Linked task</span>
                        <span className="mt-1 block font-semibold">{linkedTask.title || linkedTask.name || `Task #${linkedTask.id}`} ↗</span>
                      </a>
                    )}
                  </div>

                  <section>
                    <h3 className="mb-2 text-sm font-bold">Description</h3>
                    <p className={`whitespace-pre-wrap rounded-2xl border p-4 text-sm leading-relaxed ${dark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>{viewTicket.description || "No description was provided."}</p>
                  </section>

                  {viewTicket.screenshotUrl && (
                    <section>
                      <h3 className="mb-2 text-sm font-bold">Screenshot</h3>
                      <a href={viewTicket.screenshotUrl} target="_blank" rel="noreferrer" className="inline-block">
                        <div
                          role="img"
                          aria-label="Ticket screenshot preview"
                          className="h-72 w-full max-w-xl rounded-xl border border-slate-300 bg-contain bg-center bg-no-repeat"
                          style={{ backgroundImage: `url("${viewTicket.screenshotUrl}")` }}
                        />
                      </a>
                    </section>
                  )}

                  <section>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-bold">Attachments</h3>
                      <label className={`${buttonClass} cursor-pointer`}>
                        {uploadProgress === null ? "Upload file" : `Uploading ${uploadProgress}%`}
                        <input type="file" className="sr-only" disabled={uploadProgress !== null} onChange={(event) => void uploadAttachment(event)} />
                      </label>
                    </div>
                    {uploadProgress !== null && (
                      <div className={`mb-3 h-2 overflow-hidden rounded-full ${dark ? "bg-slate-700" : "bg-slate-200"}`}>
                        <div className="h-full bg-brand-600 transition-all" style={{ width: `${uploadProgress}%` }} />
                      </div>
                    )}
                    {viewTicket.attachments?.length ? (
                      <ul className="space-y-2">
                        {viewTicket.attachments.map((attachment) => {
                          const imageAttachment = (attachment.mimeType || attachment.mimetype || "").startsWith("image/");
                          return (
                          <li key={attachment.id} className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${dark ? "border-slate-700" : "border-slate-200"}`}>
                            <span className="min-w-0 truncate text-sm">{attachment.originalName || attachment.fileName || attachment.filename}</span>
                            <div className="flex items-center gap-3">
                              {imageAttachment && (
                                <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => void previewAttachment(viewTicket.id, attachment)}>Preview</button>
                              )}
                              <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => void downloadAttachment(viewTicket.id, attachment)}>Download</button>
                            </div>
                          </li>
                          );
                        })}
                      </ul>
                    ) : <p className={`text-sm ${mutedClass}`}>No uploaded attachments.</p>}
                  </section>

                  {(viewTicket.rootCause || viewTicket.resolutionNote) && (
                    <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
                      <h3 className="mb-1 text-sm font-bold text-emerald-600">Resolution</h3>
                      <p className="whitespace-pre-wrap text-sm">{viewTicket.resolutionNote || viewTicket.rootCause}</p>
                    </section>
                  )}

                  <section className={`space-y-3 border-t pt-5 ${dark ? "border-slate-700" : "border-slate-200"}`}>
                    <h3 className="text-sm font-bold">Ticket actions</h3>
                    {viewTicket.status !== "Resolved" && viewTicket.status !== "Closed" && (
                      <div className="flex flex-wrap gap-2">
                        {viewTicket.status === "Open" && canWorkOnTicket(viewTicket) && <button type="button" disabled={submitting} onClick={() => void updateStatus(viewTicket, "In-Progress")} className={buttonClass}>Start work</button>}
                      </div>
                    )}
                    {viewTicket.status !== "Resolved" && viewTicket.status !== "Closed" && canWorkOnTicket(viewTicket) && (
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input className={inputClass} placeholder="Resolution note required to resolve" value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)} />
                        <button type="button" disabled={submitting} onClick={() => void updateStatus(viewTicket, "Resolved")} className="shrink-0 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Resolve</button>
                      </div>
                    )}
                    {(viewTicket.status === "Resolved" || viewTicket.status === "Closed") && (
                      <div className="flex flex-wrap gap-2">
                        {viewTicket.status === "Resolved" && canCloseTicket(viewTicket) && <button type="button" disabled={submitting} onClick={() => void updateStatus(viewTicket, "Closed")} className={buttonClass}>Close ticket</button>}
                        {showReopenForm && canCloseTicket(viewTicket) ? (
                        <form onSubmit={reopenTicket} className="flex flex-col gap-2 sm:flex-row">
                          <input required className={inputClass} placeholder="Reason for reopening" value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} />
                          <button type="submit" disabled={submitting} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Reopen</button>
                          <button type="button" className={buttonClass} onClick={() => setShowReopenForm(false)}>Cancel</button>
                        </form>
                        ) : canCloseTicket(viewTicket) ? <button type="button" className={buttonClass} onClick={() => setShowReopenForm(true)}>Reopen ticket</button> : null}
                      </div>
                    )}
                  </section>
                </div>
              ) : detailTab === "activity" ? (
                <div>
                  <h3 className="mb-4 text-sm font-bold">Activity timeline</h3>
                  {viewTicket.history?.length ? (
                    <ol className="space-y-4">
                      {[...viewTicket.history].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((entry) => (
                        <li key={entry.id} className={`relative border-l-2 py-1 pl-5 ${dark ? "border-slate-700" : "border-slate-200"}`}>
                          <span className="absolute -left-[5px] top-2 h-2 w-2 rounded-full bg-brand-600" />
                          <p className="text-sm"><strong>{entry.changedByUser?.name || "Someone"}</strong> {entry.action === "created" ? "created this ticket" : `updated ${entry.field || "ticket"}`}</p>
                          {(entry.oldValue || entry.newValue) && <p className={`mt-1 text-sm ${mutedClass}`}>{entry.oldValue || "—"} → {entry.newValue || "—"}</p>}
                          <p className={`mt-1 text-xs ${mutedClass}`}>{dateLabel(entry.createdAt)}</p>
                        </li>
                      ))}
                    </ol>
                  ) : <p className={`py-8 text-center text-sm ${mutedClass}`}>No activity recorded yet.</p>}
                </div>
              ) : (
                <div className="flex min-h-72 flex-col">
                  <div className="flex-1 space-y-3">
                    {viewTicket.comments?.length ? viewTicket.comments.map((comment) => (
                      <article key={comment.id} className={`rounded-2xl border p-4 ${dark ? "border-slate-700 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
                        <div className="mb-2 flex flex-wrap justify-between gap-2">
                          <span className="text-sm font-bold">{comment.user?.name || "User"}</span>
                          <time className={`text-xs ${mutedClass}`}>{dateLabel(comment.createdAt)}</time>
                        </div>
                        <p className="whitespace-pre-wrap text-sm">{comment.comment}</p>
                      </article>
                    )) : <p className={`py-8 text-center text-sm ${mutedClass}`}>No comments yet.</p>}
                  </div>
                  <form onSubmit={handleAddComment} className={`mt-5 border-t pt-4 ${dark ? "border-slate-700" : "border-slate-200"}`}>
                    <label htmlFor="ticket-comment" className="mb-2 block text-xs font-bold">Add a comment</label>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <textarea id="ticket-comment" rows={3} className={`${inputClass} resize-y`} placeholder="Write an update or ask a question…" value={commentText} onChange={(event) => setCommentText(event.target.value)} />
                      <button type="submit" disabled={submitting || !commentText.trim()} className="self-end rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:self-stretch">Send</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
          {previewUrl && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { URL.revokeObjectURL(previewUrl); setPreviewUrl(""); } }}>
              <div className="relative max-h-[90vh] max-w-[95vw]">
                <button type="button" aria-label="Close image preview" className="absolute -right-3 -top-3 rounded-full bg-white px-3 py-1 font-bold text-slate-900 shadow" onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(""); }}>✕</button>
                <div
                  role="img"
                  aria-label="Attachment preview"
                  className="h-[88vh] max-h-[88vh] w-[94vw] max-w-[94vw] rounded-xl bg-contain bg-center bg-no-repeat"
                  style={{ backgroundImage: `url("${previewUrl}")` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
