"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import SkeletonLoader from "@/components/SkeletonLoader";
import TaskFilters, { type FilterState } from "@/components/TaskFilters";
import TaskTimeline from "@/components/TaskTimeline";
import CompleteTaskModal from "@/components/CompleteTaskModal";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

interface Member { id: number; name: string; email: string }
interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  dueDate: string;
  completedBy?: string;
  completedAt?: string;
  assignee?: Member;
  project?: { id: number; title: string }
}
interface Project {
  id: number;
  title: string;
  description: string;
  tasks?: Task[];
  creator?: { id: number; name: string; email: string }
}

// ─── Helper: overdue check ──────────────────────────────────────────────────
const isOverdue = (task: Task) =>
  task.status !== "Completed" && new Date(task.dueDate) < new Date(new Date().toDateString());

// ─── Status badge colors ────────────────────────────────────────────────────
const statusStyle: Record<string, string> = {
  Pending: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  "In-Progress": "bg-blue-500/15 text-blue-400 border-blue-500/20",
  Completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
};

// ─── Priority badge colors ──────────────────────────────────────────────────
const priorityStyle: Record<string, string> = {
  Low: "bg-gray-500/15 text-gray-400 border-gray-500/20",
  Medium: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  High: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  Urgent: "bg-red-500/15 text-red-400 border-red-500/20",
};

const priorityIcon: Record<string, string> = {
  Low: "▽",
  Medium: "◆",
  High: "▲",
  Urgent: "🔥",
};

const DEFAULT_FILTERS: FilterState = {
  search: "",
  statuses: [],
  priorities: [],
  sortBy: "createdAt",
  sortOrder: "DESC",
  overdue: false,
};

export default function AdminDashboard() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Timeline modal
  const [timelineTaskId, setTimelineTaskId] = useState<number | null>(null);

  // Modal state
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Completion modal state
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [completingSubmitting, setCompletingSubmitting] = useState(false);

  // Forms
  const [projectForm, setProjectForm] = useState({ title: "", description: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", dueDate: "", projectId: "", assignedTo: "", priority: "Medium" });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Build query params from filters
      const params = new URLSearchParams();
      if (filters.search) params.set("search", filters.search);
      if (filters.statuses.length > 0) params.set("status", filters.statuses.join(","));
      if (filters.priorities.length > 0) params.set("priority", filters.priorities.join(","));
      if (filters.overdue) params.set("overdue", "true");
      params.set("sortBy", filters.sortBy);
      params.set("sortOrder", filters.sortOrder);

      const [pRes, tRes, mRes] = await Promise.all([
        API.get("/projects"),
        API.get(`/tasks?${params.toString()}`),
        API.get("/users/members"),
      ]);
      setProjects(pRes.data.data.projects || []);
      setTasks(tRes.data.data.tasks || []);
      setMembers(mRes.data.data.members || []);
    } catch { toast.error("Failed to fetch dashboard data."); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Create Project ────────────────────────────────────────────────────────
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectForm.title.trim() || !projectForm.description.trim()) { toast.error("All fields are required."); return; }
    try {
      setSubmitting(true);
      const { data } = await API.post("/projects", projectForm);
      if (data.success) { toast.success("Project created!"); setShowProjectModal(false); setProjectForm({ title: "", description: "" }); fetchData(); }
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to create project.");
    } finally { setSubmitting(false); }
  };

  // ── Create Task ───────────────────────────────────────────────────────────
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskForm.title.trim() || !taskForm.dueDate || !taskForm.projectId || !taskForm.assignedTo) { toast.error("Please fill all required fields."); return; }
    try {
      setSubmitting(true);
      const { data } = await API.post("/tasks", {
        ...taskForm,
        projectId: Number(taskForm.projectId),
        assignedTo: Number(taskForm.assignedTo),
      });
      if (data.success) { toast.success("Task created & assigned!"); setShowTaskModal(false); setTaskForm({ title: "", description: "", dueDate: "", projectId: "", assignedTo: "", priority: "Medium" }); fetchData(); }
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to create task.");
    } finally { setSubmitting(false); }
  };

  // ── Update Priority (Admin) ───────────────────────────────────────────────
  const handlePriorityUpdate = async (taskId: number, newPriority: string) => {
    try {
      const { data } = await API.put(`/tasks/${taskId}/priority`, { priority: newPriority });
      if (data.success) {
        toast.success(`Priority updated to "${newPriority}"`);
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, priority: newPriority } : t)));
      }
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to update priority.");
    }
  };

  // ── Update Status (Admin) ─────────────────────────────────────────────────
  const handleStatusUpdate = async (taskId: number, newStatus: string) => {
    // If completing, show the modal instead
    if (newStatus === "Completed") {
      const task = tasks.find((t) => t.id === taskId);
      if (task) setCompletingTask(task);
      return;
    }

    try {
      const { data } = await API.put(`/tasks/${taskId}/status`, { status: newStatus });
      if (data.success) {
        toast.success(`Status updated to "${newStatus}"`);
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
      }
    } catch (err: unknown) {
      toast.error((err as { response?: { data?: { message?: string } } })?.response?.data?.message || "Failed to update status.");
    }
  };

  // ── Handle completion from modal ──────────────────────────────────────────
  const handleCompleteConfirm = async ({ completedBy, completedAt }: { completedBy: string; completedAt: string }) => {
    if (!completingTask) return;
    try {
      setCompletingSubmitting(true);
      const { data } = await API.put(`/tasks/${completingTask.id}/status`, {
        status: "Completed",
        completedBy,
        completedAt,
      });
      if (data.success) {
        toast.success(`Task "${completingTask.title}" marked as completed!`);
        setTasks((prev) =>
          prev.map((t) =>
            t.id === completingTask.id
              ? { ...t, status: "Completed", completedBy, completedAt }
              : t
          )
        );
        setCompletingTask(null);
      }
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          "Failed to complete task."
      );
    } finally {
      setCompletingSubmitting(false);
    }
  };

  // ── Shared input class ────────────────────────────────────────────────────
  const inputCls = `w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all t-text-primary placeholder:t-text-muted`;
  const inputStyle = {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
  };
  const labelCls = "block text-sm font-medium t-text-label mb-1.5";

  // ── Stats ─────────────────────────────────────────────────────────────────
  const overdueCount = tasks.filter(isOverdue).length;

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (loading && tasks.length === 0) return <SkeletonLoader count={6} />;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* ── Stats Row ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Projects", value: projects.length, color: "from-indigo-500 to-indigo-700", icon: "📁" },
          { label: "Tasks", value: tasks.length, color: "from-violet-500 to-violet-700", icon: "✅" },
          { label: "Members", value: members.length, color: "from-emerald-500 to-emerald-700", icon: "👥" },
          { label: "Overdue", value: overdueCount, color: overdueCount > 0 ? "from-red-500 to-red-700" : "from-gray-500 to-gray-700", icon: "⚠" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-2xl p-4 flex items-center gap-3 border transition-colors light-shadow"
            style={{
              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)",
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
            }}
          >
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>
              {s.icon}
            </div>
            <div>
              <p className="text-lg font-bold t-text-primary">{s.value}</p>
              <p className="text-xs t-text-muted">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Action Buttons ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        <button onClick={() => setShowProjectModal(true)} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 text-white text-sm font-semibold hover:shadow-lg hover:shadow-brand-500/25 transition-all cursor-pointer">+ New Project</button>
        <button
          onClick={() => setShowTaskModal(true)}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer t-text-primary"
          style={{
            background: isDark ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.8)",
            border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
          }}
        >
          + New Task
        </button>
      </div>

      {/* ── Task Filters ──────────────────────────────────────────────────── */}
      <TaskFilters filters={filters} onChange={setFilters} taskCount={tasks.length} />

      {/* ── Projects ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-bold t-text-primary mb-4">Projects</h2>
        {projects.length === 0 ? (
          <p className="t-text-muted text-sm">No projects yet. Create one above.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {projects.map((p) => (
              <div
                key={p.id}
                className="rounded-2xl p-6 border transition-colors light-shadow"
                style={{
                  background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)",
                  borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                }}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-base t-text-primary">{p.title}</h3>
                  <span className="text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-full">{p.tasks?.length || 0} tasks</span>
                </div>
                <p className="t-text-secondary text-sm line-clamp-2 mb-4">{p.description}</p>
                <div className="pt-3 border-t text-xs t-text-muted" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>Created by {p.creator?.name || "—"}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Tasks ─────────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-bold t-text-primary mb-4">All Tasks</h2>
        {tasks.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📋</p>
            <p className="t-text-muted text-sm">No tasks match your filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {tasks.map((t) => {
              const overdue = isOverdue(t);
              return (
                <div
                  key={t.id}
                  className={`rounded-2xl p-6 transition-all border ${overdue ? "border-2 border-red-500/50" : "light-shadow"}`}
                  style={{
                    background: overdue
                      ? (isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.05)")
                      : (isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.85)"),
                    borderColor: overdue
                      ? undefined
                      : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"),
                  }}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-mono t-text-muted">#{t.id}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${priorityStyle[t.priority] || ""}`}>
                          {priorityIcon[t.priority]} {t.priority}
                        </span>
                      </div>
                      <h3 className={`font-semibold text-base ${overdue ? "text-red-400" : "t-text-primary"}`}>{t.title}</h3>
                    </div>
                    <span className={`text-xs px-2.5 py-0.5 rounded-full border font-medium shrink-0 ml-2 ${statusStyle[t.status] || ""}`}>{t.status}</span>
                  </div>
                  {t.description && <p className="t-text-secondary text-sm line-clamp-2 mb-3">{t.description}</p>}
                  {overdue && <p className="text-xs text-red-400 font-semibold mb-3">⚠ OVERDUE</p>}

                  {/* Priority Selector (Admin) */}
                  <div className="flex items-center gap-1.5 mb-3">
                    {["Low", "Medium", "High", "Urgent"].map((p) => (
                      <button
                        key={p}
                        onClick={() => handlePriorityUpdate(t.id, p)}
                        className={`text-[10px] px-2 py-0.5 rounded-md border font-medium transition-all cursor-pointer ${
                          t.priority === p ? priorityStyle[p] : "t-text-muted opacity-40 hover:opacity-70"
                        }`}
                        style={{
                          borderColor: t.priority === p ? undefined : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"),
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  {/* Status Quick Actions */}
                  <div className="flex items-center gap-1.5 mb-3">
                    {["Pending", "In-Progress", "Completed"].map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusUpdate(t.id, s)}
                        className={`text-[10px] px-2 py-1 rounded-md border font-medium transition-all cursor-pointer flex-1 text-center ${
                          t.status === s ? statusStyle[s] : "t-text-muted opacity-40 hover:opacity-70"
                        }`}
                        style={{
                          borderColor: t.status === s ? undefined : (isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"),
                        }}
                      >
                        {s === "In-Progress" ? "In-Prog" : s}
                      </button>
                    ))}
                  </div>

                  {/* Meta */}
                  <div
                    className="pt-3 border-t flex items-center justify-between text-xs t-text-muted"
                    style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}
                  >
                    <span>📁 {t.project?.title || "—"}</span>
                    <span>Due: {t.dueDate}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <span className="text-xs t-text-muted">👤 {t.assignee?.name || "Unassigned"}</span>
                      {t.status === "Completed" && t.completedBy && (
                        <p className="text-[10px] t-text-muted mt-0.5">
                          ✓ by {t.completedBy} {t.completedAt ? `on ${t.completedAt}` : ""}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setTimelineTaskId(t.id)}
                      className="text-[10px] px-2.5 py-1 rounded-lg bg-brand-500/10 text-brand-400 border border-brand-500/20 hover:bg-brand-500/20 transition-all cursor-pointer font-medium"
                    >
                      📜 Timeline
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Complete Task Modal ────────────────────────────────────────────── */}
      {completingTask && (
        <CompleteTaskModal
          taskId={completingTask.id}
          taskTitle={completingTask.title}
          currentUserName={user?.name || ""}
          onConfirm={handleCompleteConfirm}
          onCancel={() => setCompletingTask(null)}
          submitting={completingSubmitting}
        />
      )}

      {/* ── Timeline Modal ─────────────────────────────────────────────────── */}
      {timelineTaskId && (
        <TaskTimeline taskId={timelineTaskId} onClose={() => setTimelineTaskId(null)} />
      )}

      {/* ── Create Project Modal ──────────────────────────────────────────── */}
      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--overlay-bg)" }} onClick={() => setShowProjectModal(false)}>
          <div
            className="rounded-2xl p-8 w-full max-w-lg shadow-2xl animate-slide-up border"
            style={{
              background: "var(--modal-bg)",
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold t-text-primary mb-6">Create New Project</h2>
            <form onSubmit={handleCreateProject} className="space-y-5">
              <div><label className={labelCls}>Title</label><input className={inputCls} style={inputStyle} value={projectForm.title} onChange={(e) => setProjectForm((p) => ({ ...p, title: e.target.value }))} placeholder="Project name" /></div>
              <div><label className={labelCls}>Description</label><textarea className={`${inputCls} min-h-[100px] resize-none`} style={inputStyle} value={projectForm.description} onChange={(e) => setProjectForm((p) => ({ ...p, description: e.target.value }))} placeholder="What is this project about?" /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowProjectModal(false)} className="px-4 py-2 rounded-xl text-sm t-text-muted hover:t-text-primary transition-colors cursor-pointer">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">{submitting ? "Creating…" : "Create Project"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Create Task Modal ─────────────────────────────────────────────── */}
      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "var(--overlay-bg)" }} onClick={() => setShowTaskModal(false)}>
          <div
            className="rounded-2xl p-8 w-full max-w-lg shadow-2xl animate-slide-up border max-h-[90vh] overflow-y-auto"
            style={{
              background: "var(--modal-bg)",
              borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-bold t-text-primary mb-6">Create New Task</h2>
            <form onSubmit={handleCreateTask} className="space-y-5">
              <div><label className={labelCls}>Title</label><input className={inputCls} style={inputStyle} value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} placeholder="Task title" /></div>
              <div><label className={labelCls}>Description (optional)</label><textarea className={`${inputCls} min-h-[80px] resize-none`} style={inputStyle} value={taskForm.description} onChange={(e) => setTaskForm((p) => ({ ...p, description: e.target.value }))} placeholder="Task details" /></div>
              <div><label className={labelCls}>Due Date</label><input type="date" className={inputCls} style={inputStyle} value={taskForm.dueDate} onChange={(e) => setTaskForm((p) => ({ ...p, dueDate: e.target.value }))} /></div>
              <div>
                <label className={labelCls}>Priority</label>
                <div className="flex gap-2">
                  {["Low", "Medium", "High", "Urgent"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setTaskForm((prev) => ({ ...prev, priority: p }))}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                        taskForm.priority === p ? priorityStyle[p] : "t-text-muted"
                      }`}
                      style={{
                        borderColor: taskForm.priority === p ? undefined : (isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)"),
                        background: taskForm.priority !== p ? (isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)") : undefined,
                      }}
                    >
                      {priorityIcon[p]} {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Project</label>
                <select className={`${inputCls} appearance-none cursor-pointer`} style={inputStyle} value={taskForm.projectId} onChange={(e) => setTaskForm((p) => ({ ...p, projectId: e.target.value }))}>
                  <option value="">Select a project</option>
                  {projects.map((pr) => <option key={pr.id} value={pr.id}>{pr.title}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Assign To</label>
                <select className={`${inputCls} appearance-none cursor-pointer`} style={inputStyle} value={taskForm.assignedTo} onChange={(e) => setTaskForm((p) => ({ ...p, assignedTo: e.target.value }))}>
                  <option value="">Select a member</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.email})</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowTaskModal(false)} className="px-4 py-2 rounded-xl text-sm t-text-muted hover:t-text-primary transition-colors cursor-pointer">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">{submitting ? "Creating…" : "Create Task"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
