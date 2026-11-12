"use client";

import { useEffect, useMemo, useState } from "react";
import API from "@/lib/axios";
import { useAuth } from "@/context/AuthContext";
import WorkItemCreateActions from "@/components/WorkItemCreateActions";
import WorkItemDetails from "@/components/WorkItemDetails";
import type { WorkItem } from "@/components/WorkItemsTable";

interface ProjectTask {
  id: number;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  progress: number;
  createdAt: string;
  assignee?: NonNullable<WorkItem["assignedTo"]> | null;
}

interface Project {
  id: number;
  title: string;
  description: string;
  department: string | null;
  createdAt: string;
  creator?: { id: number; name: string; email?: string } | null;
  tasks: ProjectTask[];
}

interface ProjectsResponse {
  success: boolean;
  data: { count: number; projects: Project[] };
  message?: string;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "No deadline";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString();
}

function isDone(status: string) {
  return ["Completed", "DONE", "Resolved", "Closed"].includes(status);
}

export default function ProjectsDirectory() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [assignableUsers, setAssignableUsers] = useState<NonNullable<WorkItem["assignedTo"]>[]>([]);
  const [selectedTask, setSelectedTask] = useState<WorkItem | null>(null);
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null);
  const [projectDescriptionDraft, setProjectDescriptionDraft] = useState("");
  const [savingProjectId, setSavingProjectId] = useState<number | null>(null);
  const [descriptionError, setDescriptionError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      API.get<ProjectsResponse>("/projects", { signal: controller.signal }),
      API.get<{ data: { members: NonNullable<WorkItem["assignedTo"]>[] } }>("/users/members", { signal: controller.signal }).catch(() => null),
    ])
      .then(([projectResponse, memberResponse]) => {
        setProjects(projectResponse.data.data.projects || []);
        setAssignableUsers(memberResponse?.data.data.members || []);
      })
      .catch((requestError: unknown) => {
        if (controller.signal.aborted) return;
        setError((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not load projects.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const visibleProjects = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return projects;
    return projects.filter((project) => [project.title, project.description, project.department, project.creator?.name]
      .some((value) => value?.toLocaleLowerCase().includes(query)) || project.tasks.some((task) => task.title.toLocaleLowerCase().includes(query)));
  }, [projects, search]);
  const taskCount = projects.reduce((count, project) => count + project.tasks.length, 0);
  const completedCount = projects.reduce((count, project) => count + project.tasks.filter((task) => isDone(task.status)).length, 0);

  async function saveProjectDescription(project: Project) {
    const description = projectDescriptionDraft.trim();
    if (!description) {
      setDescriptionError("Project description cannot be empty.");
      return;
    }
    setSavingProjectId(project.id);
    setDescriptionError("");
    try {
      await API.put(`/projects/${project.id}/description`, { description });
      setProjects((current) => current.map((entry) => entry.id === project.id ? { ...entry, description } : entry));
      setEditingProjectId(null);
    } catch (requestError) {
      setDescriptionError((requestError as { response?: { data?: { message?: string } } }).response?.data?.message || "Could not save the project description.");
    } finally {
      setSavingProjectId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="dashboard-page-title">Projects</h1><p className="dashboard-page-subtitle">Projects and their task progress in your workspace.</p></div>
        <div className="flex flex-wrap items-center gap-3"><input aria-label="Search projects" className="w-64 max-w-full rounded-lg border t-border-subtle bg-transparent px-3 py-2 text-sm t-text-primary" type="search" placeholder="Search projects or tasks…" value={search} onChange={(event) => setSearch(event.target.value)} /><WorkItemCreateActions /></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[{ label: "Projects", value: projects.length }, { label: "Visible tasks", value: taskCount }, { label: "Completed tasks", value: completedCount }].map((stat) => <div className="rounded-xl border t-border-subtle t-bg-card p-4" key={stat.label}><p className="text-xs t-text-muted">{stat.label}</p><p className="mt-1 text-2xl font-bold t-text-primary">{loading ? "—" : stat.value}</p></div>)}
      </div>

      {error ? <div className="rounded-xl border border-red-500/30 p-4 text-sm text-red-500" role="alert">{error} <button className="ml-2 underline" type="button" onClick={() => window.location.reload()}>Retry</button></div> : loading ? <p className="p-6 text-sm t-text-muted" role="status">Loading projects…</p> : visibleProjects.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {visibleProjects.map((project) => {
            const completed = project.tasks.filter((task) => isDone(task.status)).length;
            const open = project.tasks.length - completed;
            const canEditProjectDescription = user?.position === "MANAGER" || Number(project.creator?.id) === Number(user?.id);
            return <article className="overflow-hidden rounded-xl border t-border-subtle t-bg-card" key={project.id}>
              <div className="border-b t-border-subtle p-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-indigo-500">{project.department || "Unassigned department"}</p><h2 className="mt-1 text-lg font-semibold t-text-primary">{project.title}</h2></div><span className="rounded-full bg-slate-500/10 px-3 py-1 text-xs t-text-secondary">{project.tasks.length} tasks</span></div>
                {editingProjectId === project.id ? <div className="mt-3 grid gap-2">
                  <textarea aria-label={`${project.title} description`} className="min-h-28 resize-y rounded-lg border t-border-subtle bg-transparent p-3 text-sm t-text-primary" maxLength={10000} value={projectDescriptionDraft} disabled={savingProjectId === project.id} onChange={(event) => setProjectDescriptionDraft(event.target.value)} />
                  {descriptionError && <p className="text-sm text-red-500" role="alert">{descriptionError}</p>}
                  <div className="flex gap-2"><button type="button" className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={savingProjectId === project.id || projectDescriptionDraft.trim() === project.description} onClick={() => void saveProjectDescription(project)}>{savingProjectId === project.id ? "Saving…" : "Save description"}</button><button type="button" className="rounded-lg border t-border-subtle px-3 py-2 text-sm t-text-secondary" disabled={savingProjectId === project.id} onClick={() => { setEditingProjectId(null); setDescriptionError(""); }}>Cancel</button></div>
                </div> : <div className="mt-3 flex items-start justify-between gap-3"><p className="whitespace-pre-line text-sm t-text-secondary">{project.description}</p>{canEditProjectDescription && <button type="button" className="shrink-0 text-xs font-semibold text-indigo-500 hover:text-indigo-400" onClick={() => { setEditingProjectId(project.id); setProjectDescriptionDraft(project.description); setDescriptionError(""); }}>Edit</button>}</div>}
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs t-text-muted"><span>Created by {project.creator?.name || "Unknown"}</span><span>Created {dateLabel(project.createdAt)}</span><span>{open} open · {completed} complete</span></div>
              </div>
              <details className="group">
                <summary className="cursor-pointer px-5 py-3 text-sm font-semibold t-text-primary">View project tasks</summary>
                {project.tasks.length ? <div className="overflow-x-auto border-t t-border-subtle"><table className="w-full min-w-[600px] text-left text-sm"><thead className="text-xs uppercase t-text-muted"><tr>{["Task", "Assigned to", "Status", "Progress", "Priority", "Due", ""].map((label) => <th className="px-4 py-3 font-medium" key={label || "action"}>{label}</th>)}</tr></thead><tbody className="divide-y t-border-subtle">{project.tasks.map((task) => <tr className="t-text-primary" key={task.id}><td className="px-4 py-3"><span className="font-medium">{task.title}</span><span className="block text-xs t-text-muted">TASK-{task.id}</span></td><td className="px-4 py-3">{task.assignee?.name || "Unassigned"}</td><td className="px-4 py-3">{task.status}</td><td className="px-4 py-3">{task.status === "Completed" ? 100 : task.progress || 0}%</td><td className="px-4 py-3">{task.priority}</td><td className="px-4 py-3">{dateLabel(task.dueDate)}</td><td className="px-4 py-3"><button type="button" className="work-items-view-row" onClick={() => setSelectedTask({ type: "task", id: task.id, referenceId: `TASK-${task.id}`, title: task.title, description: task.description, assignedTo: task.assignee || null, createdBy: null, createdAt: task.createdAt, department: project.department || "—", priority: task.priority, rawPriority: task.priority, deadline: task.dueDate, status: task.status, rawStatus: task.status, progress: task.progress || 0 })}>Update</button></td></tr>)}</tbody></table></div> : <p className="border-t t-border-subtle px-5 py-4 text-sm t-text-muted">No visible tasks in this project yet.</p>}
              </details>
            </article>;
          })}
        </div>
      ) : <div className="rounded-xl border t-border-subtle t-bg-card p-8 text-center"><h2 className="font-semibold t-text-primary">{projects.length ? "No projects match this search" : "No projects found"}</h2><p className="mt-2 text-sm t-text-muted">{projects.length ? "Try another project, department, or task name." : "Projects created in your permitted scope will appear here."}</p></div>}
      {!loading && !error && <p className="text-xs t-text-muted">Showing {visibleProjects.length} of {projects.length} projects.</p>}
      {selectedTask && <WorkItemDetails key={`${selectedTask.type}-${selectedTask.id}`} item={selectedTask} assignableUsers={assignableUsers} onClose={() => setSelectedTask(null)} />}
    </div>
  );
}
