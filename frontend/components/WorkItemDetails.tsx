"use client";

import { useEffect, useMemo, useState } from "react";
import API from "@/lib/axios";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/rbac";
import { TaskProgressControl } from "@/components/TaskProgress";

interface Person {
  id: number;
  name: string;
  department: string;
  position: string;
}

interface WorkItem {
  type: "task" | "ticket";
  id: number;
  referenceId: string;
  title: string;
  description?: string | null;
  assignedTo: Person | null;
  createdBy: Pick<Person, "id" | "name" | "position"> | null;
  createdAt: string;
  department: string;
  priority: string;
  rawPriority?: string;
  progress: number;
  deadline: string | null;
  status: string;
  rawStatus: string;
}

interface HistoryEntry {
  id: number | string;
  field: string;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  action: string;
  createdAt: string;
  changedByUser?: { name: string };
  user?: { name: string };
}

interface CommentEntry {
  id: number | string;
  comment: string;
  createdAt: string;
  user?: { name: string };
}

interface DetailResponse {
  success: boolean;
  data: {
    history?: HistoryEntry[];
    comments?: CommentEntry[];
    ticket?: {
      history?: HistoryEntry[];
      comments?: CommentEntry[];
      deadlineHistory?: Array<{
        id: number;
        oldDeadline: string | null;
        newDeadline: string;
        reason: string;
        changedAt: string;
        changedByUser?: { id: number; name: string };
      }>;
    };
  };
}

interface Props {
  item: WorkItem;
  assignableUsers: Person[];
  onClose: () => void;
}

const rank: Record<string, number> = {
  INTERN: 1,
  EMPLOYEE: 2,
  TEAM_LEAD: 3,
  SUB_MANAGER: 4,
  MANAGER: 5,
};

function getErrorMessage(error: unknown) {
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
  return "Could not complete the request.";
}

function shortDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export default function WorkItemDetails({ item, assignableUsers, onClose }: Props) {
  const { user } = useAuth();
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [description, setDescription] = useState(item.description || "");
  const [comment, setComment] = useState("");
  const [deadline, setDeadline] = useState("");
  const [reason, setReason] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [pendingStatus, setPendingStatus] = useState<"Resolved" | "Open" | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [error, setError] = useState("");

  const isManager = user?.position === "MANAGER";
  const isIntern = user?.position === "INTERN";
  const assignedToMe = Number(item.assignedTo?.id) === Number(user?.id);
  const canManageTeamItem = isManager || (
    !!item.assignedTo &&
    item.assignedTo.department === user?.department &&
    (rank[user?.position || ""] || 0) > (rank[item.assignedTo.position] || 0)
  ) || (
    item.type === "ticket" &&
    !item.assignedTo &&
    item.createdBy?.id === user?.id
  );
  const canAssign = can(
    user,
    item.type === "task" ? "task:assign" : "ticket:assign",
  ) && (canManageTeamItem || item.createdBy?.id === user?.id);
  const canEditDeadline = !isIntern && canManageTeamItem &&
    ["MANAGER", "SUB_MANAGER", "TEAM_LEAD"].includes(user?.position || "");
  const canEditPriority = canEditDeadline;
  const canEditDescription = assignedToMe || canManageTeamItem || item.createdBy?.id === user?.id;
  const canReopenTicket = item.type === "ticket" && (isManager || item.createdBy?.id === user?.id) && ["Resolved", "Closed"].includes(item.rawStatus);
  const canChangeStatus = !isIntern && (assignedToMe || canManageTeamItem || canReopenTicket);
  const canEditProgress = !isIntern && (assignedToMe || canManageTeamItem) &&
    !(item.type === "task" && ["Completed", "DONE"].includes(item.rawStatus)) &&
    !(item.type === "ticket" && ["Resolved", "Closed"].includes(item.rawStatus));
  const canClose = item.type === "task"
    ? !["Completed", "DONE"].includes(item.rawStatus) && (isIntern ? assignedToMe : canManageTeamItem || assignedToMe)
    : item.rawStatus !== "Closed" && (isIntern ? assignedToMe : canManageTeamItem || assignedToMe || item.createdBy?.id === user?.id);

  const priorityValue = useMemo(() => item.rawPriority || item.priority, [item]);

  useEffect(() => {
    let active = true;
    const loadDetails = async () => {
      setLoading(true);
      setError("");
      try {
        if (item.type === "task") {
          const { data } = await API.get<DetailResponse>(`/tasks/${item.id}/history`);
          if (active) {
            setHistory(data.data.history || []);
            setComments(
              (data.data.history || [])
                .filter((entry) => entry.field === "comment" && entry.newValue)
                .map((entry) => ({
                  id: entry.id,
                  comment: entry.newValue || "",
                  createdAt: entry.createdAt,
                  user: { name: entry.changedByUser?.name || "Team member" },
                })),
            );
          }
        } else {
          const { data } = await API.get<DetailResponse>(`/tickets/${item.id}`);
          if (active) {
            const ticketHistory = data.data.ticket?.history || [];
            const deadlineHistory = (data.data.ticket?.deadlineHistory || []).map((entry) => ({
              id: `deadline-${entry.id}`,
              field: "deadline",
              oldValue: entry.oldDeadline,
              newValue: entry.newDeadline,
              reason: entry.reason,
              action: "deadline_changed",
              createdAt: entry.changedAt,
              changedByUser: entry.changedByUser,
            }));
            setHistory(
              [...ticketHistory, ...deadlineHistory]
                .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()),
            );
            setComments(data.data.ticket?.comments || []);
          }
        }
      } catch (requestError) {
        if (active) setError(getErrorMessage(requestError));
      } finally {
        if (active) setLoading(false);
      }
    };
    void loadDetails();
    return () => {
      active = false;
    };
  }, [item.id, item.type]);

  async function perform(action: () => Promise<unknown>): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await action();
      window.location.reload();
      return true;
    } catch (requestError) {
      setError(getErrorMessage(requestError));
      setBusy(false);
      return false;
    }
  }

  function changeStatus(status: string) {
    if (status === item.rawStatus) return;
    setPendingStatus(null);
    if (item.type === "task") {
      const body = status === "Completed"
        ? { status, completedBy: user?.name || "Assigned user", completedAt: new Date().toISOString().slice(0, 10) }
        : { status };
      void perform(() => API.put(`/tasks/${item.id}/status`, body));
      return;
    }
    if (status === "Resolved") {
      setPendingStatus("Resolved");
      setStatusReason("");
      setError("");
      return;
    }
    if (status === "Open") {
      setPendingStatus("Open");
      setStatusReason("");
      setError("");
      return;
    }
    void perform(() => API.put(`/tickets/${item.id}/status`, { status }));
  }

  function applyPendingStatus() {
    if (!pendingStatus || !statusReason.trim()) {
      setError(pendingStatus === "Resolved" ? "Add a resolution note before resolving this ticket." : "Add a reason before reopening this ticket.");
      return;
    }
    if (pendingStatus === "Resolved") {
      void perform(() => API.put(`/tickets/${item.id}/status`, { status: "Resolved", resolutionNote: statusReason.trim() }));
    } else {
      void perform(() => API.put(`/tickets/${item.id}/reopen`, { reason: statusReason.trim() }));
    }
  }

  const statusOptions = item.type === "task"
    ? ["Pending", "In-Progress", "Completed"]
    : item.rawStatus === "Open"
      ? ["Open", "In-Progress", "Resolved"]
      : item.rawStatus === "In-Progress"
        ? ["In-Progress", "Resolved"]
        : [item.rawStatus, ...(item.rawStatus === "Resolved" ? ["Closed"] : []), ...(canReopenTicket ? ["Open"] : [])];

  const statusTimeline = useMemo(() => {
    const entries = history.filter((entry) => entry.field === "status");
    const timeline = entries.map((entry) => ({
      id: entry.id,
      status: (entry.newValue || "").startsWith("Completed by:") ? "Completed" : entry.newValue || "Unknown",
      createdAt: entry.createdAt,
      user: entry.changedByUser?.name || entry.user?.name || "Team member",
    }));
    if (!entries.some((entry) => !entry.oldValue)) {
      const initialStatus = entries[0]?.oldValue || (entries.length ? "" : item.type === "task" ? "Pending" : "Open");
      if (initialStatus) timeline.unshift({ id: `initial-${item.id}`, status: initialStatus, createdAt: item.createdAt, user: "Item created" });
    }
    return timeline;
  }, [history, item]);

  function updatePriority(value: string) {
    const priority = item.type === "task"
      ? value
      : value;
    void perform(() => API.put(
      item.type === "task" ? `/tasks/${item.id}/priority` : `/tickets/${item.id}/priority`,
      { priority },
    ));
  }

  function updateAssignee(value: string) {
    const assignedTo = value ? Number(value) : null;
    void perform(() => API.put(
      item.type === "task" ? `/tasks/${item.id}/assignee` : `/tickets/${item.id}/assignee`,
      { assignedTo },
    ));
  }

  function extendDeadline() {
    if (!deadline || !reason.trim()) {
      setError("Enter a new deadline and the reason for the extension.");
      return;
    }
    void perform(() => item.type === "task"
      ? API.put(`/tasks/${item.id}`, { dueDate: deadline, reason: reason.trim() })
      : API.put(`/tickets/${item.id}/deadline`, { deadline, reason: reason.trim() }));
  }

  function closeItem() {
    if (item.type === "task") {
      const today = new Date().toISOString().slice(0, 10);
      void perform(() => API.put(`/tasks/${item.id}/status`, {
        status: "Completed",
        completedBy: user?.name || "Assigned user",
        completedAt: today,
      }));
      return;
    }
    if (item.rawStatus === "Resolved") {
      void perform(() => API.put(`/tickets/${item.id}/status`, { status: "Closed" }));
    } else {
      if (!resolutionNote.trim()) {
        setError("Add a short resolution note before closing this ticket.");
        return;
      }
      void perform(() => API.put(`/tickets/${item.id}/status`, {
        status: "Resolved",
        resolutionNote: resolutionNote.trim(),
      }));
    }
  }

  function addComment() {
    const value = comment.trim();
    if (!value) return;
    void perform(() => API.post(
      item.type === "task" ? `/tasks/${item.id}/comments` : `/tickets/${item.id}/comments`,
      { comment: value },
    ));
  }

  function saveDescription() {
    const value = description.trim();
    if (value === (item.description || "")) return;
    void perform(() => API.put(
      item.type === "task" ? `/tasks/${item.id}` : `/tickets/${item.id}/description`,
      { description: value || null },
    ));
  }

  return (
    <div className="work-items-dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="work-items-dialog work-item-details"
        role="dialog"
        aria-modal="true"
        aria-labelledby="work-item-detail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="work-items-dialog-header">
          <div>
            <span className="work-items-id">{item.referenceId}</span>
            <h2 id="work-item-detail-title">{item.title}</h2>
          </div>
          <button type="button" aria-label="Close details" onClick={onClose}>×</button>
        </div>
        <dl>
          <div><dt>Assigned to</dt><dd>{item.assignedTo?.name || "Unassigned"}</dd></div>
          <div><dt>Created by</dt><dd>{item.createdBy?.name || "—"}</dd></div>
          <div><dt>Department</dt><dd>{item.department}</dd></div>
          <div><dt>Priority</dt><dd>{item.priority}</dd></div>
          <div><dt>Deadline</dt><dd>{shortDate(item.deadline)}</dd></div>
          <div><dt>Status</dt><dd>{item.rawStatus}</dd></div>
          <div className="work-item-detail-progress"><dt>Work completed</dt><dd><TaskProgressControl
            progress={item.progress || 0}
            status={item.type === "task"
              ? item.rawStatus === "Completed" || item.rawStatus === "DONE" ? "Completed" : item.rawStatus
              : ["Resolved", "Closed"].includes(item.rawStatus) ? "Completed" : item.rawStatus}
            disabled={!canEditProgress || busy}
            label={`${item.type === "task" ? "Task" : "Ticket"} progress`}
            onSave={(progress) => perform(() => API.put(
              item.type === "task" ? `/tasks/${item.id}/progress` : `/tickets/${item.id}/progress`,
              { progress },
            ))}
          /></dd></div>
        </dl>

        <section className="work-item-detail-description">
          <h3>Description</h3>
          <textarea
            aria-label={`${item.type === "task" ? "Task" : "Ticket"} description`}
            maxLength={10000}
            rows={5}
            value={description}
            disabled={!canEditDescription || busy}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add a description…"
          />
          {canEditDescription && <button
            type="button"
            className="work-item-create-button"
            disabled={busy || description.trim() === (item.description || "")}
            onClick={saveDescription}
          >Save description</button>}
        </section>

        {error && <p className="work-item-dialog-error" role="alert">{error}</p>}

        <div className="work-item-detail-actions">
          {canChangeStatus && (
            <label>
              Update status
              <select value={item.rawStatus} disabled={busy} onChange={(event) => changeStatus(event.target.value)}>
                {statusOptions.map((status) => <option key={status} value={status}>{status.replaceAll("-", " ")}</option>)}
              </select>
            </label>
          )}
          {pendingStatus && (
            <div className="work-item-detail-deadline">
              <label>
                {pendingStatus === "Resolved" ? "Resolution note" : "Reopen reason"}
                <input type="text" maxLength={10000} value={statusReason} disabled={busy} onChange={(event) => setStatusReason(event.target.value)} />
              </label>
              <button type="button" className="work-item-create-button is-primary" disabled={busy || !statusReason.trim()} onClick={applyPendingStatus}>
                {pendingStatus === "Resolved" ? "Resolve ticket" : "Reopen ticket"}
              </button>
              <button type="button" className="work-item-dialog-cancel" disabled={busy} onClick={() => setPendingStatus(null)}>Cancel</button>
            </div>
          )}
          {canAssign && (
            <label>
              Reassign
              <select value={item.assignedTo?.id || ""} disabled={busy} onChange={(event) => updateAssignee(event.target.value)}>
                {item.type === "ticket" && <option value="">Unassigned</option>}
                {assignableUsers.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name} · {person.department} · {person.position.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {canEditPriority && (
            <label>
              Change priority
              <select value={priorityValue} disabled={busy} onChange={(event) => updatePriority(event.target.value)}>
                {(item.type === "task"
                  ? ["Low", "Medium", "High", "Urgent"]
                  : ["P2", "P1", "P0"]
                ).map((value) => <option key={value} value={value}>{value === "P0" ? "Critical" : value}</option>)}
              </select>
            </label>
          )}
          {canEditDeadline && (
            <div className="work-item-detail-deadline">
              <label>
                Extend deadline
                <input type="date" min={item.deadline || new Date().toISOString().slice(0, 10)} value={deadline} disabled={busy} onChange={(event) => setDeadline(event.target.value)} />
              </label>
              <label>
                Reason
                <input type="text" maxLength={2000} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
              </label>
              <button type="button" className="work-item-create-button" disabled={busy || !deadline || !reason.trim()} onClick={extendDeadline}>Save deadline</button>
            </div>
          )}
          {canClose && (
            <div className="work-item-detail-close">
              {item.type === "ticket" && item.rawStatus !== "Resolved" && (
                <label>
                  Resolution note
                  <input type="text" maxLength={10000} value={resolutionNote} disabled={busy} onChange={(event) => setResolutionNote(event.target.value)} />
                </label>
              )}
              <button type="button" className="work-item-create-button is-primary" disabled={busy} onClick={closeItem}>
                {item.type === "task" ? "Close task" : item.rawStatus === "Resolved" ? "Close ticket" : "Resolve ticket"}
              </button>
            </div>
          )}
        </div>

        <div className="work-item-detail-comments">
          <h3>Comments</h3>
          <form onSubmit={(event) => { event.preventDefault(); addComment(); }}>
            <input aria-label="Add a comment" value={comment} maxLength={255} disabled={busy} onChange={(event) => setComment(event.target.value)} placeholder="Write a comment…" />
            <button type="submit" className="work-item-create-button" disabled={busy || !comment.trim()}>Add</button>
          </form>
          {comments.map((entry) => (
            <article key={entry.id}>
              <p>{entry.comment}</p>
              <small>{entry.user?.name || "Team member"} · {new Date(entry.createdAt).toLocaleString()}</small>
            </article>
          ))}
          {!loading && comments.length === 0 && <p className="work-item-detail-muted">No comments yet.</p>}
        </div>

        <div className="work-item-detail-history work-item-status-timeline">
          <h3>Status timeline</h3>
          {loading ? <p className="work-item-detail-muted">Loading status dates…</p> : statusTimeline.length ? statusTimeline.map((entry) => (
            <article key={entry.id}>
              <p><strong>{entry.status.replaceAll("-", " ")}</strong> status</p>
              <small>{new Date(entry.createdAt).toLocaleString()} · {entry.user}</small>
            </article>
          )) : <p className="work-item-detail-muted">No status changes have been recorded yet.</p>}
        </div>

        <div className="work-item-detail-history">
          <h3>History</h3>
          {loading ? <p className="work-item-detail-muted">Loading history…</p> : history.length ? (
            history.map((entry) => (
              <article key={entry.id}>
                  <p><strong>{entry.changedByUser?.name || entry.user?.name || "Team member"}</strong> · {entry.field}: {entry.oldValue ? `${entry.oldValue} → ` : ""}{entry.newValue || entry.action}</p>
                  {entry.reason && <p>Reason: {entry.reason}</p>}
                  <small>{new Date(entry.createdAt).toLocaleString()}</small>
              </article>
            ))
          ) : <p className="work-item-detail-muted">No history available.</p>}
        </div>
      </section>
    </div>
  );
}
