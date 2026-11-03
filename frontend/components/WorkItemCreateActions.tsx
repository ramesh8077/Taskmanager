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
  const [loadingOptions, setLoadingOptions] = useState(initialDialog === "task");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const scopedProjects = projects.filter((project) => project.department);
  const canCreateTask = can(user, "task:create");
  const canCreateTicket = can(user, "ticket:create");
  const canCreateProject = ["MANAGER", "SUB_MANAGER"].includes(user?.position || "") &&
    can(user, "project:create");

  function openTaskDialog() {
    setDialog("task");
    setError("");
    setLoadingOptions(true);
  }

  function openTicketDialog() {
    setDialog("ticket");
    setError("");
    setLoadingOptions(true);
  }

  useEffect(() => {
    if (dialog !== "task" && dialog !== "ticket") return;
    let active = true;
    const loadTaskOptions = async () => {
      try {
        const [projectResponse, memberResponse] = await Promise.all([
          API.get<ApiEnvelope<{ projects: ProjectOption[] }>>("/projects"),
          API.get<ApiEnvelope<{ members: MemberOption[] }>>("/users/members"),
        ]);
        if (!active) return;
        setProjects(projectResponse.data.data.projects || []);
        setMembers(memberResponse.data.data.members || []);
      } catch (requestError) {
        if (active) setError(getErrorMessage(requestError));
      } finally {
        if (active) setLoadingOptions(false);
      }
    };
    void loadTaskOptions();
    return () => {
      active = false;
    };
  }, [dialog]);

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
      await API.post("/tasks", {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        projectId: Number(formData.get("projectId")),
        assignedTo: Number(formData.get("assignedTo")),
        dueDate: String(formData.get("dueDate") || ""),
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
    try {
      const assignedTo = formData.get("assignedTo");
      const deadline = String(formData.get("deadline") || "");
      await API.post("/tickets", {
        title: String(formData.get("title") || ""),
        description: String(formData.get("description") || ""),
        priority: String(formData.get("priority") || "P2"),
        ...(user?.position === "MANAGER" && formData.get("department")
          ? { department: String(formData.get("department")) }
          : {}),
        ...(user?.position === "INTERN"
          ? { assignedTo: user.id }
          : assignedTo
            ? { assignedTo: Number(assignedTo) }
            : {}),
        ...(deadline ? { deadline } : {}),
      });
      setDialog(null);
      window.location.reload();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
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
            ) : loadingOptions ? (
              <p className="work-item-dialog-loading" role="status">Loading projects and assignable team members…</p>
            ) : dialog === "ticket" ? (
              <form action={(formData) => void submitTicket(formData)} className="work-item-dialog-form">
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
                  {user?.position !== "INTERN" && can(user, "ticket:assign") && (
                    <label>
                      Assign to
                      <select name="assignedTo" defaultValue="">
                        <option value="">Unassigned</option>
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
                      Deadline
                      <input name="deadline" type="date" />
                    </label>
                  )}
                </div>
                <div className="work-item-dialog-actions">
                  <button type="button" className="work-item-dialog-cancel" disabled={submitting} onClick={() => setDialog(null)}>Cancel</button>
                  <button type="submit" className="work-item-create-button is-primary" disabled={submitting}>{submitting ? "Creating…" : "Create ticket"}</button>
                </div>
              </form>
            ) : (
              <form action={(formData) => void submitTask(formData)} className="work-item-dialog-form">
                <label>
                  Task title
                  <input name="title" minLength={3} maxLength={200} required />
                </label>
                <label>
                  Description
                  <textarea name="description" rows={3} maxLength={10000} />
                </label>
                <div className="work-item-dialog-grid">
                  <label>
                    Project
                    <select name="projectId" required defaultValue="">
                      <option value="" disabled>Select a project</option>
                      {scopedProjects.map((project) => <option key={project.id} value={project.id}>{project.title} · {project.department}</option>)}
                    </select>
                  </label>
                  <label>
                    Assigned to
                    <select name="assignedTo" required defaultValue="">
                      <option value="" disabled>Select a team member</option>
                      <option value={user?.id}>Me ({user?.name})</option>
                      {(can(user, "task:assign") ? members : []).map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name} · {member.department} · {member.position.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Deadline
                    <input name="dueDate" type="date" required />
                  </label>
                  <label>
                    Priority
                    <select name="priority" defaultValue="Medium">
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Urgent</option>
                    </select>
                  </label>
                </div>
                {scopedProjects.length === 0 && (
                  <p className="work-item-dialog-hint">
                    There are no projects available in your scope. Ask a Manager to create a project first.
                  </p>
                )}
                {members.length === 0 && (
                  <p className="work-item-dialog-hint">
                    There are no team members you can assign tasks to.
                  </p>
                )}
                <div className="work-item-dialog-actions">
                  <button type="button" className="work-item-dialog-cancel" disabled={submitting} onClick={() => setDialog(null)}>Cancel</button>
                  <button type="submit" className="work-item-create-button is-primary" disabled={submitting || scopedProjects.length === 0}>{submitting ? "Creating…" : "Create task"}</button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
