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

const isOverdue = (task: Task) =>
  task.status !== "Completed" && new Date(task.dueDate) < new Date(new Date().toDateString());

const statusStyle: Record<string, string> = {
  Pending: "bg-amber-500/15 text-amber-500 border-amber-500/20",
  "In-Progress": "bg-blue-500/15 text-blue-500 border-blue-500/20",
  Completed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
};

const priorityStyle: Record<string, string> = {
  Low: "bg-gray-500/15 text-gray-500 border-gray-500/20",
  Medium: "bg-blue-500/15 text-blue-500 border-blue-500/20",
  High: "bg-orange-500/15 text-orange-500 border-orange-500/20",
  Urgent: "bg-red-500/15 text-red-500 border-red-500/20",
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

  const [timelineTaskId, setTimelineTaskId] = useState<number | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [completingSubmitting, setCompletingSubmitting] = useState(false);

  const [projectForm, setProjectForm] = useState({ title: "", description: "" });
  const [taskForm, setTaskForm] = useState({ title: "", description: "", dueDate: "", projectId: "", assignedTo: "", priority: "Medium" });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
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

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectForm.title.trim() || !projectForm.description.trim()) { toast.error("All fields are required."); return; }
    try {
      setSubmitting(true);
      const { data } = await API.post("/projects", projectForm);
      if (data.success) { toast.success("Project created!"); setShowProjectModal(false); setProjectForm({ title: "", description: "" }); fetchData(); }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create project.");
    } finally { setSubmitting(false); }
  };

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
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create task.");
    } finally { setSubmitting(false); }
  };

  const handlePriorityUpdate = async (taskId: number, newPriority: string) => {
    try {
      const { data } = await API.put(`/tasks/${taskId}/priority`, { priority: newPriority });
      if (data.success) {
        toast.success(`Priority updated to "${newPriority}"`);
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, priority: newPriority } : t)));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update priority.");
    }
  };

  const handleStatusUpdate = async (taskId: number, newStatus: string) => {
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
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status.");
    }
  };

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
        setTasks((prev) => prev.map((t) => t.id === completingTask.id ? { ...t, status: "Completed", completedBy, completedAt } : t));
        setCompletingTask(null);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to complete task.");
    } finally {
      setCompletingSubmitting(false);
    }
  };

  const inputCls = `w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all t-text-primary placeholder:t-text-muted`;
  const inputStyle = {
    background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
  };
  const labelCls = "block text-sm font-medium t-text-label mb-1.5";
  const overdueCount = tasks.filter(isOverdue).length;

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
          <div key={s.label} className="rounded-2xl p-4 flex items-center gap-3 border t-border-subtle t-bg-card transition-colors light-shadow">
            <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>{s.icon}</div>
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
        <button onClick={() => setShowTaskModal(true)} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer t-text-primary t-bg-card border t-border-default hover:t-bg-card-hover">+ New Task</button>
      </div>

      {/* ── Task Filters ──────────────────────────────────────────────────── */}
      <TaskFilters filters={filters} onChange={setFilters} taskCount={tasks.length} />

      {/* ── Projects ──────────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xl font-bold t-text-primary mb-4">Projects</h2>
        {projects.length === 0 ? (
          <p className="t-text-muted text-sm italic">No projects created yet.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <div key={p.id} className="p-5 rounded-2xl border t-border-subtle t-bg-card light-shadow">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-sm t-text-primary">{p.title}</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-bold border border-indigo-500/10">{p.tasks?.length || 0} tasks</span>
                </div>
                <p className="text-xs t-text-secondary line-clamp-2 mb-4">{p.description}</p>
                <div className="pt-3 border-t t-border-subtle flex justify-between items-center">
                  <span className="text-[10px] t-text-muted">By {p.creator?.name || "System"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Tasks Table ────────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold t-text-primary">All Tasks</h2>
          <div className="text-xs t-text-muted font-medium">
            Total: <span className="font-bold t-text-primary">{tasks.length}</span>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="text-center py-16 t-bg-card rounded-2xl border t-border-subtle">
            <p className="text-4xl mb-3">📋</p>
            <p className="t-text-muted text-sm">No tasks found.</p>
          </div>
        ) : (
          <div className="rounded-2xl border t-border-subtle t-bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-b t-border-subtle t-text-muted text-[11px] uppercase tracking-wider font-bold bg-zinc-500/5">
                    <th className="px-6 py-4">ID</th>
                    <th className="px-6 py-4">Task Details</th>
                    <th className="px-6 py-4">Assignee</th>
                    <th className="px-6 py-4">Project</th>
                    <th className="px-6 py-4">Priority</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Due Date</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y t-border-subtle">
                  {tasks.map((t) => {
                    const overdue = isOverdue(t);
                    return (
                      <tr key={t.id} className={`group transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${overdue ? "bg-red-500/5" : ""}`}>
                        <td className="px-6 py-4 text-xs font-mono t-text-muted">#{t.id}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className={`font-bold text-sm ${overdue ? "text-red-500" : "t-text-primary"}`}>{t.title}</span>
                            {t.description && <span className="text-[11px] t-text-muted line-clamp-1">{t.description}</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-brand-500/10 flex items-center justify-center text-[10px] font-bold text-brand-500">{t.assignee?.name?.charAt(0) || "U"}</div>
                            <span className="text-xs t-text-secondary">{t.assignee?.name || "Unassigned"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs t-text-secondary">{t.project?.title || "—"}</td>
                        <td className="px-6 py-4">
                          <select value={t.priority} onChange={(e) => handlePriorityUpdate(t.id, e.target.value)} className={`text-[10px] px-2 py-1 rounded-md border font-bold bg-transparent outline-none cursor-pointer ${priorityStyle[t.priority]}`}>
                            {["Low", "Medium", "High", "Urgent"].map(p => <option key={p} value={p} className="bg-white dark:bg-zinc-900 text-black dark:text-white">{p}</option>)}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <select value={t.status} onChange={(e) => handleStatusUpdate(t.id, e.target.value)} className={`text-[10px] px-2 py-1 rounded-md border font-bold bg-transparent outline-none cursor-pointer ${statusStyle[t.status]}`}>
                            {["Pending", "In-Progress", "Completed"].map(s => <option key={s} value={s} className="bg-white dark:bg-zinc-900 text-black dark:text-white">{s}</option>)}
                          </select>
                        </td>
                        <td className="px-6 py-4">
                          <div className={`flex flex-col ${overdue ? "text-red-500" : "t-text-muted"}`}>
                            <span className="text-xs font-medium">{t.dueDate}</span>
                            {overdue && <span className="text-[9px] font-bold uppercase">Overdue</span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button onClick={() => setTimelineTaskId(t.id)} className="p-2 rounded-lg hover:bg-brand-500/10 text-brand-500 transition-colors">📜</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {completingTask && <CompleteTaskModal taskId={completingTask.id} taskTitle={completingTask.title} currentUserName={user?.name || ""} onConfirm={handleCompleteConfirm} onCancel={() => setCompletingTask(null)} submitting={completingSubmitting} />}
      {timelineTaskId && <TaskTimeline taskId={timelineTaskId} onClose={() => setTimelineTaskId(null)} />}
      
      {showProjectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowProjectModal(false)}>
          <div className="rounded-2xl p-8 w-full max-w-lg shadow-2xl t-bg-card border t-border-subtle animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold t-text-primary mb-6">Create New Project</h2>
            <form onSubmit={handleCreateProject} className="space-y-5">
              <div><label className={labelCls}>Title</label><input className={inputCls} style={inputStyle} value={projectForm.title} onChange={(e) => setProjectForm(p => ({ ...p, title: e.target.value }))} placeholder="Project name" /></div>
              <div><label className={labelCls}>Description</label><textarea className={`${inputCls} min-h-[100px] resize-none`} style={inputStyle} value={projectForm.description} onChange={(e) => setProjectForm(p => ({ ...p, description: e.target.value }))} placeholder="Details..." /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowProjectModal(false)} className="px-4 py-2 text-sm t-text-muted hover:t-text-primary">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold">{submitting ? "Creating…" : "Create Project"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showTaskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowTaskModal(false)}>
          <div className="rounded-2xl p-8 w-full max-w-lg shadow-2xl t-bg-card border t-border-subtle animate-slide-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold t-text-primary mb-6">Create New Task</h2>
            <form onSubmit={handleCreateTask} className="space-y-5">
              <div><label className={labelCls}>Title</label><input className={inputCls} style={inputStyle} value={taskForm.title} onChange={(e) => setTaskForm(p => ({ ...p, title: e.target.value }))} placeholder="Task title" /></div>
              <div><label className={labelCls}>Description</label><textarea className={`${inputCls} min-h-[80px] resize-none`} style={inputStyle} value={taskForm.description} onChange={(e) => setTaskForm(p => ({ ...p, description: e.target.value }))} placeholder="Task details" /></div>
              <div><label className={labelCls}>Due Date</label><input type="date" className={inputCls} style={inputStyle} value={taskForm.dueDate} onChange={(e) => setTaskForm(p => ({ ...p, dueDate: e.target.value }))} /></div>
              <div>
                <label className={labelCls}>Priority</label>
                <div className="grid grid-cols-4 gap-2">
                  {["Low", "Medium", "High", "Urgent"].map(p => (
                    <button key={p} type="button" onClick={() => setTaskForm(prev => ({ ...prev, priority: p }))} className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${taskForm.priority === p ? priorityStyle[p] : "t-text-muted t-bg-card"}`}>{p}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>Project</label>
                <select className={inputCls} style={inputStyle} value={taskForm.projectId} onChange={(e) => setTaskForm(p => ({ ...p, projectId: e.target.value }))}>
                  <option value="">Select project</option>
                  {projects.map(pr => <option key={pr.id} value={pr.id}>{pr.title}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Assign Member</label>
                <select className={inputCls} style={inputStyle} value={taskForm.assignedTo} onChange={(e) => setTaskForm(p => ({ ...p, assignedTo: e.target.value }))}>
                  <option value="">Select member</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowTaskModal(false)} className="px-4 py-2 text-sm t-text-muted hover:t-text-primary">Cancel</button>
                <button type="submit" disabled={submitting} className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold">{submitting ? "Creating…" : "Create Task"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
