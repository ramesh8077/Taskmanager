"use client";

import { useEffect, useState } from "react";
import API from "@/lib/axios";
import { useAuth } from "@/context/AuthContext";
import { can } from "@/lib/rbac";
import { DEPARTMENTS } from "../../shared/organization";

interface ProjectOption {
  id: number;
  title: string;
  department: string | null;
}

interface MemberOption {
  id: number;
  name: string;
  department: string;
  position: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

function getErrorMessage(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT")
  ) {
    return "The server took too long to respond. Please try again.";
  }
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
  return "Could not complete the request. Please try again.";
}

export default function WorkItemCreateActions({
  initialDialog = null,
}: {
  initialDialog?: "task" | "ticket" | "project" | null;
}) {
  const { user } = useAuth();
  const [dialog, setDialog] = useState<"task" | "ticket" | "project" | null>(initialDialog);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [projectLoadError, setProjectLoadError] = useState(false);
  const [memberLoadError, setMemberLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [taskStartDate, setTaskStartDate] = useState("");
  const [taskEndDate, setTaskEndDate] = useState("");
  const [ticketStartDate, setTicketStartDate] = useState("");
  const [ticketEndDate, setTicketEndDate] = useState("");
  const [ticketScreenshot, setTicketScreenshot] = useState<File | null>(null);
  const [ticketScreenshotPreview, setTicketScreenshotPreview] = useState("");
  const [ticketCreatedId, setTicketCreatedId] = useState<number | null>(null);
  const durationDays = (from: string, to: string) => from && to && from <= to
    ? Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1
    : 0;

  useEffect(() => {
    if (!ticketScreenshot) {
      setTicketScreenshotPreview("");
      return;
    }
    const url = URL.createObjectURL(ticketScreenshot);
    setTicketScreenshotPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [ticketScreenshot]);

  const scopedProjects = projects.filter((project) => project.department);
  const canCreateTask = can(user, "task:create");
  const canCreateTicket = can(user, "ticket:create");
  const canAssignTasks = can(user, "task:assign");
  const canAssignTickets = can(user, "ticket:assign");
  const canCreateProject = ["MANAGER", "SUB_MANAGER"].includes(user?.position || "") &&
    can(user, "project:create");

  function openTaskDialog() {
    setDialog("task");
    setError("");
  }

  function openTicketDialog() {
    setDialog("ticket");
    setError("");
    setTicketCreatedId(null);
    setTicketScreenshot(null);
  }

  useEffect(() => {
    if (dialog !== "task" && dialog !== "ticket") return;
    let active = true;
    const loadProjects = dialog === "task";
    const loadMembers = dialog === "task" ? canAssignTasks : canAssignTickets;

    if (loadProjects) {
      setLoadingProjects(true);
      setProjectLoadError(false);
      void API.get<ApiEnvelope<{ projects: ProjectOption[] }>>("/projects")
        .then((response) => {
          if (active) setProjects(response.data.data.projects || []);
        })
        .catch(() => {
          if (active) setProjectLoadError(true);
        })
        .finally(() => {
          if (active) setLoadingProjects(false);
        });
    } else {
      setLoadingProjects(false);
    }

    if (loadMembers) {
      setLoadingMembers(true);
      setMemberLoadError(false);
      void API.get<ApiEnvelope<{ members: MemberOption[] }>>(dialog === "ticket" ? "/users/members?for=ticket" : "/users/members")
        .then((response) => {
          if (active) setMembers(response.data.data.members || []);
        })
        .catch(() => {
          if (active) setMemberLoadError(true);
        })
        .finally(() => {
          if (active) setLoadingMembers(false);
        });
    } else {
      setMembers([]);
      setLoadingMembers(false);
      setMemberLoadError(false);
    }

    return () => {
      active = false;
    };
  }, [dialog, canAssignTasks, canAssignTickets]);

  async function submitProject(formData: FormData) {
    setError("");
    setSubmitting(true);
    try {
      await API.post("/projects", {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        ...(user?.position === "MANAGER"
          ? { department: String(formData.get("department") || "") }
          : {}),
      });
      setDialog(null);
      window.location.reload();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTask(formData: FormData) {
    setError("");
    setSubmitting(true);
    try {
      const dueDate = String(formData.get("dueDate") || "");
      const startDate = String(formData.get("startDate") || "");
      if (startDate && startDate > dueDate) throw new Error("From date must be on or before To date.");
      await API.post("/tasks", {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        projectId: formData.get("projectId") ? Number(formData.get("projectId")) : null,
        assignedTo: Number(formData.get("assignedTo")),
        dueDate,
        ...(startDate ? { startDate } : {}),
        priority: String(formData.get("priority") || "Medium"),
      });
      setDialog(null);
      window.location.reload();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitTicket(formData: FormData) {
    setError("");
    setSubmitting(true);
    let createdTicketId: number | null = null;
    try {
      const assignedTo = formData.get("assignedTo");
      const deadline = String(formData.get("deadline") || "");
      const startDate = String(formData.get("startDate") || "");
      if (startDate && !deadline) throw new Error("Select a To date when you set a From date.");
      if (startDate && deadline && startDate > deadline) throw new Error("From date must be on or before To date.");
      const response = await API.post<ApiEnvelope<{ ticket: { id: number } }>>("/tickets", {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        priority: String(formData.get("priority") || "P2"),
        ...(user?.position === "MANAGER" && formData.get("department")
          ? { department: String(formData.get("department")) }
          : {}),
        ...(!ticketScreenshot && user?.position === "INTERN"
          ? { assignedTo: user.id }
          : !ticketScreenshot && assignedTo
            ? { assignedTo: Number(assignedTo) }
            : {}),
        ...(deadline ? { deadline } : {}),
        ...(startDate ? { startDate } : {}),
      });
      createdTicketId = response.data.data.ticket.id;
      if (ticketScreenshot) {
        const attachment = new FormData();
        attachment.append("file", ticketScreenshot);
        await API.post(`/tickets/${createdTicketId}/attachments`, attachment, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (assignedTo && Number(assignedTo) !== user?.id) {
          await API.put(`/tickets/${createdTicketId}/assignee`, { assignedTo: Number(assignedTo) });
        }
      }
      setDialog(null);
      setTicketScreenshot(null);
      window.location.reload();
    } catch (requestError) {
      if (createdTicketId) {
        setTicketCreatedId(createdTicketId);
        setError(`Ticket #${createdTicketId} was created, but its screenshot or assignment could not be saved. Open the ticket to finish it.`);
      } else {
        setError(getErrorMessage(requestError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!canCreateTask && !canCreateTicket && !canCreateProject) return null;

  return (
    <>
      <div className="work-item-create-actions">
        {canCreateProject && (
          <button type="button" className="work-item-create-button" onClick={() => {
            setError("");
            setDialog("project");
          }}>
            + New project
          </button>
        )}
        {canCreateTicket && (
          <button type="button" className="work-item-create-button" onClick={openTicketDialog}>
            + New ticket
          </button>
        )}
        {canCreateTask && (
          <button type="button" className="work-item-create-button is-primary" onClick={openTaskDialog}>
            + New task
          </button>
        )}
      </div>

      {dialog && (
        <div
          className="work-item-dialog-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submitting) setDialog(null);
          }}
        >
          <section
            aria-labelledby="work-item-dialog-title"
            aria-modal="true"
            className="work-item-dialog"
            role="dialog"
          >
            <div className="work-item-dialog-heading">
              <div>
                <h2 id="work-item-dialog-title">
                  {dialog === "task" ? "Create task" : dialog === "ticket" ? "Create ticket" : "Create project"}
                </h2>
                <p>
                  {dialog === "task"
                    ? "Assign work within your permitted team."
                    : dialog === "ticket"
                      ? "Report and route an issue within your permitted scope."
                      : "Create a project for your workspace."}
                </p>
              </div>
              <button type="button" className="work-item-dialog-close" aria-label="Close dialog" disabled={submitting} onClick={() => setDialog(null)}>×</button>
            </div>

            {error && <p className="work-item-dialog-error" role="alert">{error}</p>}

            {dialog === "project" ? (
              <form action={(formData) => void submitProject(formData)} className="work-item-dialog-form">
                <label>
                  Project title
                  <input name="title" minLength={3} maxLength={200} required />
                </label>
                <label>
                  Description
                  <textarea name="description" rows={4} maxLength={10000} required />
                </label>
                {user?.position === "MANAGER" && (
                  <label>
                    Department
                    <select name="department" required defaultValue="">
                      <option value="" disabled>Select a department</option>
                      {DEPARTMENTS.map((department) => (
                        <option key={department} value={department}>{department}</option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="work-item-dialog-actions">
                  <button type="button" className="work-item-dialog-cancel" disabled={submitting} onClick={() => setDialog(null)}>Cancel</button>
                  <button type="submit" className="work-item-create-button is-primary" disabled={submitting}>{submitting ? "Creating…" : "Create project"}</button>
                </div>
              </form>
            ) : dialog === "ticket" && ticketCreatedId ? (
              <div className="work-item-dialog-form">
                <p className="work-item-dialog-hint">Ticket #{ticketCreatedId} was created. You can open it from the ticket list to add the screenshot or finish assignment.</p>
                <div className="work-item-dialog-actions">
                  <button type="button" className="work-item-create-button is-primary" onClick={() => { setDialog(null); window.location.reload(); }}>Done</button>
                </div>
              </div>
            ) : dialog === "ticket" ? (
              <form action={(formData) => void submitTicket(formData)} onPaste={(event) => {
                const item = Array.from(event.clipboardData.items).find((entry) => entry.type.startsWith("image/"));
                const image = item?.getAsFile();
                if (!image) return;
                event.preventDefault();
                const extension = image.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
                const file = new File([image], `ticket-screenshot.${extension}`, { type: image.type });
                if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
                  setError("Choose a JPG, PNG, GIF, or WebP image.");
                } else if (file.size > 8 * 1024 * 1024) {
                  setError("Screenshot must be 8 MB or smaller.");
                } else {
                  setError("");
                  setTicketScreenshot(file);
                }
              }} className="work-item-dialog-form">
                <label>
                  Ticket title
                  <input name="title" minLength={3} maxLength={200} required />
                </label>
                <label>
                  Description
                  <textarea name="description" rows={4} maxLength={10000} />
                </label>
                <div className="work-item-dialog-grid">
                  {user?.position === "MANAGER" && (
                    <label>
                      Department
                      <select name="department" required defaultValue="">
                        <option value="">Use assignee department</option>
                        {DEPARTMENTS.map((department) => (
                          <option key={department} value={department}>{department}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label>
                    Priority
                    <select name="priority" defaultValue="P2">
                      <option value="P2">Low</option>
                      <option value="P1">High</option>
                      <option value="P0">Critical</option>
                    </select>
                  </label>
                  {can(user, "ticket:assign") && (
                    <label>
                      Assign to
                    <select name="assignedTo" defaultValue="">
                        <option value="">Unassigned</option>
                      {loadingMembers && <option disabled>Loading team members…</option>}
                        {members.map((member) => (
                          <option key={member.id} value={member.id}>
                            {member.name} · {member.department} · {member.position.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {["MANAGER", "SUB_MANAGER", "TEAM_LEAD"].includes(user?.position || "") && (
                    <label>
                      <span className="mb-2 block">Development period</span>
                      <span className="grid grid-cols-2 gap-2">
                        <span>From<input name="startDate" type="date" value={ticketStartDate} onChange={(event) => setTicketStartDate(event.target.value)} /></span>
                        <span>To<input name="deadline" type="date" value={ticketEndDate} min={ticketStartDate || undefined} onChange={(event) => setTicketEndDate(event.target.value)} /></span>
                      </span>
                      {durationDays(ticketStartDate, ticketEndDate) > 0 && <span className="work-item-dialog-hint">{durationDays(ticketStartDate, ticketEndDate)} calendar days</span>}
                    </label>
                  )}
                </div>
                <label>
                  Screenshot image (choose a file or paste with Ctrl+V)
                  <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (!["image/jpeg", "image/png", "image/gif", "image/webp"].includes(file.type)) {
                      setError("Choose a JPG, PNG, GIF, or WebP image.");
                    } else if (file.size > 8 * 1024 * 1024) {
                      setError("Screenshot must be 8 MB or smaller.");
                    } else {
                      setError("");
                      setTicketScreenshot(file);
                    }
                    event.currentTarget.value = "";
                  }} />
                  {ticketScreenshotPreview && <span className="mt-2 flex items-start gap-3"><img src={ticketScreenshotPreview} alt="Screenshot preview" className="max-h-40 max-w-full rounded-lg border object-contain" /><button type="button" className="work-item-dialog-cancel" onClick={() => setTicketScreenshot(null)}>Remove</button></span>}
                </label>
                <div className="work-item-dialog-actions">
                  <button type="button" className="work-item-dialog-cancel" disabled={submitting} onClick={() => setDialog(null)}>Cancel</button>
                  <button type="submit" className="work-item-create-button is-primary" disabled={submitting}>{submitting ? "Creating…" : "Create ticket"}</button>
                </div>
              </form>
            ) : (
              <form action={(formData) => void submitTask(formData)} className="work-item-dialog-form">
                <label>
                  Task title (required)
                  <input name="title" minLength={3} maxLength={200} required />
                </label>
                <label>
                  Description (optional)
                  <textarea name="description" rows={3} maxLength={10000} />
                </label>
                <div className="work-item-dialog-grid">
                  <label>
                    Project (optional)
                    <select name="projectId" defaultValue="">
                      <option value="">No project</option>
                      {loadingProjects && <option disabled>Loading projects…</option>}
                      {scopedProjects.map((project) => <option key={project.id} value={project.id}>{project.title} · {project.department}</option>)}
                    </select>
                    {!loadingProjects && (projectLoadError || scopedProjects.length === 0) && (
                      <span className="work-item-dialog-hint">
                        {projectLoadError
                          ? "Projects could not be loaded. You can still create this task without one."
                          : "No projects available. You can still create this task without one."}
                      </span>
                    )}
                  </label>
                  <label>
                    Assignee (required)
                    <select name="assignedTo" required defaultValue={user?.id || ""}>
                      {user && <option value={user.id}>Assign to me ({user.name})</option>}
                      {loadingMembers && <option disabled>Loading team members…</option>}
                      {(can(user, "task:assign") ? members : []).map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} · {member.department} · {member.position.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label>From date (optional)<input name="startDate" type="date" value={taskStartDate} onChange={(event) => setTaskStartDate(event.target.value)} /></label>
                    <label>To date / deadline (required)<input name="dueDate" type="date" required min={taskStartDate || undefined} value={taskEndDate} onChange={(event) => setTaskEndDate(event.target.value)} /></label>
                    {durationDays(taskStartDate, taskEndDate) > 0 && <span className="work-item-dialog-hint col-span-2">Estimated development period: {durationDays(taskStartDate, taskEndDate)} calendar days</span>}
                  </div>
                  <label>
                    Priority (default: Medium)
                    <select name="priority" defaultValue="Medium">
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Urgent</option>
                    </select>
                  </label>
                </div>
                {!loadingMembers && canAssignTasks && (memberLoadError || members.length === 0) && (
                  <p className="work-item-dialog-hint">
                    {memberLoadError
                      ? "Team members could not be loaded. You can still assign this task to yourself."
                      : "There are no team members you can assign tasks to."}
                  </p>
                )}
                <div className="work-item-dialog-actions">
                  <button type="button" className="work-item-dialog-cancel" disabled={submitting} onClick={() => setDialog(null)}>Cancel</button>
                  <button type="submit" className="work-item-create-button is-primary" disabled={submitting}>{submitting ? "Creating…" : "Create task"}</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
