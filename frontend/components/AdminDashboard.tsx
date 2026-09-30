// "use client";

// import { useState, useEffect, useCallback } from "react";
// import toast from "react-hot-toast";
// import API from "@/lib/axios";
// import SkeletonLoader from "@/components/SkeletonLoader";
// import TaskFilters, { type FilterState } from "@/components/TaskFilters";
// import TaskTimeline from "@/components/TaskTimeline";
// import CompleteTaskModal from "@/components/CompleteTaskModal";
// import { useTheme } from "@/context/ThemeContext";
// import { useAuth } from "@/context/AuthContext";

// interface Member { id: number; name: string; email: string }
// interface Task {
//   id: number;
//   title: string;
//   description?: string;
//   status: string;
//   priority: string;
//   dueDate: string;
//   completedBy?: string;
//   completedAt?: string;
//   assignee?: Member;
//   project?: { id: number; title: string }
// }
// interface Project {
//   id: number;
//   title: string;
//   description: string;
//   tasks?: Task[];
//   creator?: { id: number; name: string; email: string }
// }

// const isOverdue = (task: Task) =>
//   task.status !== "Completed" && new Date(task.dueDate) < new Date(new Date().toDateString());

// const statusStyle: Record<string, string> = {
//   Pending: "bg-amber-500/15 text-amber-500 border-amber-500/20",
//   "In-Progress": "bg-blue-500/15 text-blue-500 border-blue-500/20",
//   Completed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
// };

// const priorityStyle: Record<string, string> = {
//   Low: "bg-gray-500/15 text-gray-500 border-gray-500/20",
//   Medium: "bg-blue-500/15 text-blue-500 border-blue-500/20",
//   High: "bg-orange-500/15 text-orange-500 border-orange-500/20",
//   Urgent: "bg-red-500/15 text-red-500 border-red-500/20",
// };

// const priorityIcon: Record<string, string> = {
//   Low: "▽",
//   Medium: "◆",
//   High: "▲",
//   Urgent: "🔥",
// };

// const DEFAULT_FILTERS: FilterState = {
//   search: "",
//   statuses: [],
//   priorities: [],
//   sortBy: "createdAt",
//   sortOrder: "DESC",
//   overdue: false,
// };

// export default function AdminDashboard() {
//   const { isDark } = useTheme();
//   const { user } = useAuth();
//   const [projects, setProjects] = useState<Project[]>([]);
//   const [tasks, setTasks] = useState<Task[]>([]);
//   const [members, setMembers] = useState<Member[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

//   const [timelineTaskId, setTimelineTaskId] = useState<number | null>(null);
//   const [showProjectModal, setShowProjectModal] = useState(false);
//   const [showTaskModal, setShowTaskModal] = useState(false);
//   const [submitting, setSubmitting] = useState(false);

//   const [completingTask, setCompletingTask] = useState<Task | null>(null);
//   const [completingSubmitting, setCompletingSubmitting] = useState(false);

//   const [projectForm, setProjectForm] = useState({ title: "", description: "" });
//   const [taskForm, setTaskForm] = useState({ title: "", description: "", dueDate: "", projectId: "", assignedTo: "", priority: "Medium" });

//   const fetchData = useCallback(async () => {
//     try {
//       setLoading(true);
//       const params = new URLSearchParams();
//       if (filters.search) params.set("search", filters.search);
//       if (filters.statuses.length > 0) params.set("status", filters.statuses.join(","));
//       if (filters.priorities.length > 0) params.set("priority", filters.priorities.join(","));
//       if (filters.overdue) params.set("overdue", "true");
//       params.set("sortBy", filters.sortBy);
//       params.set("sortOrder", filters.sortOrder);

//       const [pRes, tRes, mRes] = await Promise.all([
//         API.get("/projects"),
//         API.get(`/tasks?${params.toString()}`),
//         API.get("/users/members"),
//       ]);
//       setProjects(pRes.data.data.projects || []);
//       setTasks(tRes.data.data.tasks || []);
//       setMembers(mRes.data.data.members || []);
//     } catch { toast.error("Failed to fetch dashboard data."); }
//     finally { setLoading(false); }
//   }, [filters]);

//   useEffect(() => { fetchData(); }, [fetchData]);

//   const handleCreateProject = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!projectForm.title.trim() || !projectForm.description.trim()) { toast.error("All fields are required."); return; }
//     try {
//       setSubmitting(true);
//       const { data } = await API.post("/projects", projectForm);
//       if (data.success) { toast.success("Project created!"); setShowProjectModal(false); setProjectForm({ title: "", description: "" }); fetchData(); }
//     } catch (err: any) {
//       toast.error(err.response?.data?.message || "Failed to create project.");
//     } finally { setSubmitting(false); }
//   };

//   const handleCreateTask = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!taskForm.title.trim() || !taskForm.dueDate || !taskForm.projectId || !taskForm.assignedTo) { toast.error("Please fill all required fields."); return; }
//     try {
//       setSubmitting(true);
//       const { data } = await API.post("/tasks", {
//         ...taskForm,
//         projectId: Number(taskForm.projectId),
//         assignedTo: Number(taskForm.assignedTo),
//       });
//       if (data.success) { toast.success("Task created & assigned!"); setShowTaskModal(false); setTaskForm({ title: "", description: "", dueDate: "", projectId: "", assignedTo: "", priority: "Medium" }); fetchData(); }
//     } catch (err: any) {
//       toast.error(err.response?.data?.message || "Failed to create task.");
//     } finally { setSubmitting(false); }
//   };

//   const handlePriorityUpdate = async (taskId: number, newPriority: string) => {
//     try {
//       const { data } = await API.put(`/tasks/${taskId}/priority`, { priority: newPriority });
//       if (data.success) {
//         toast.success(`Priority updated to "${newPriority}"`);
//         setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, priority: newPriority } : t)));
//       }
//     } catch (err: any) {
//       toast.error(err.response?.data?.message || "Failed to update priority.");
//     }
//   };

//   const handleStatusUpdate = async (taskId: number, newStatus: string) => {
//     if (newStatus === "Completed") {
//       const task = tasks.find((t) => t.id === taskId);
//       if (task) setCompletingTask(task);
//       return;
//     }
//     try {
//       const { data } = await API.put(`/tasks/${taskId}/status`, { status: newStatus });
//       if (data.success) {
//         toast.success(`Status updated to "${newStatus}"`);
//         setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
//       }
//     } catch (err: any) {
//       toast.error(err.response?.data?.message || "Failed to update status.");
//     }
//   };

//   const handleCompleteConfirm = async ({ completedBy, completedAt }: { completedBy: string; completedAt: string }) => {
//     if (!completingTask) return;
//     try {
//       setCompletingSubmitting(true);
//       const { data } = await API.put(`/tasks/${completingTask.id}/status`, {
//         status: "Completed",
//         completedBy,
//         completedAt,
//       });
//       if (data.success) {
//         toast.success(`Task "${completingTask.title}" marked as completed!`);
//         setTasks((prev) => prev.map((t) => t.id === completingTask.id ? { ...t, status: "Completed", completedBy, completedAt } : t));
//         setCompletingTask(null);
//       }
//     } catch (err: any) {
//       toast.error(err.response?.data?.message || "Failed to complete task.");
//     } finally {
//       setCompletingSubmitting(false);
//     }
//   };

//   const inputCls = `w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all t-text-primary placeholder:t-text-muted`;
//   const inputStyle = {
//     background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
//     border: `1px solid ${isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)"}`,
//   };
//   const labelCls = "block text-sm font-medium t-text-label mb-1.5";
//   const overdueCount = tasks.filter(isOverdue).length;

//   if (loading && tasks.length === 0) return <SkeletonLoader count={6} />;

//   return (
//     <div className="space-y-8 animate-fade-in">
//       {/* ── Stats Row ─────────────────────────────────────────────────────── */}
//       <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
//         {[
//           { label: "Projects", value: projects.length, color: "from-indigo-500 to-indigo-700", icon: "📁" },
//           { label: "Tasks", value: tasks.length, color: "from-violet-500 to-violet-700", icon: "✅" },
//           { label: "Members", value: members.length, color: "from-emerald-500 to-emerald-700", icon: "👥" },
//           { label: "Overdue", value: overdueCount, color: overdueCount > 0 ? "from-red-500 to-red-700" : "from-gray-500 to-gray-700", icon: "⚠" },
//         ].map((s) => (
//           <div key={s.label} className="rounded-2xl p-4 flex items-center gap-3 border t-border-subtle t-bg-card transition-colors light-shadow">
//             <div className={`w-11 h-11 rounded-xl bg-linear-to-br ${s.color} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>{s.icon}</div>
//             <div>
//               <p className="text-lg font-bold t-text-primary">{s.value}</p>
//               <p className="text-xs t-text-muted">{s.label}</p>
//             </div>
//           </div>
//         ))}
//       </div>

//       {/* ── Action Buttons ────────────────────────────────────────────────── */}
//       <div className="flex flex-wrap gap-3">
//         <button onClick={() => setShowProjectModal(true)} className="px-5 py-2.5 rounded-xl bg-linear-to-r from-brand-600 to-brand-500 text-white text-sm font-semibold hover:shadow-lg hover:shadow-brand-500/25 transition-all cursor-pointer">+ New Project</button>
//         <button onClick={() => setShowTaskModal(true)} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer text-white bg-red-400 border t-border-default hover:bg-red-500 hover:text-white hover:shadow-lg hover:shadow-red-500/25 cursor">+ New Task</button>
//       </div>

//       {/* ── Task Filters ──────────────────────────────────────────────────── */}
//       <TaskFilters filters={filters} onChange={setFilters} taskCount={tasks.length} />

//       {/* ── Projects ──────────────────────────────────────────────────────── */}
//       <section>
//         <h2 className="text-xl font-bold t-text-primary mb-4">Projects</h2>
//         {projects.length === 0 ? (
//           <p className="t-text-muted text-sm italic">No projects created yet.</p>
//         ) : (
//           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//             {projects.map(p => (
//               <div key={p.id} className="p-5 rounded-2xl border t-border-subtle t-bg-card light-shadow">
//                 <div className="flex justify-between items-start mb-2">
//                   <h3 className="font-bold text-sm t-text-primary">{p.title}</h3>
//                   <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-bold border border-indigo-500/10">{p.tasks?.length || 0} tasks</span>
//                 </div>
//                 <p className="text-xs t-text-secondary line-clamp-2 mb-4">{p.description}</p>
//                 <div className="pt-3 border-t t-border-subtle flex justify-between items-center">
//                   <span className="text-[10px] t-text-muted">By {p.creator?.name || "System"}</span>
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </section>

//       {/* ── Tasks Table ────────────────────────────────────────────────────── */}
//       <section>
//         <div className="flex items-center justify-between mb-4">
//           <h2 className="text-xl font-bold t-text-primary">All Tasks</h2>
//           <div className="text-xs t-text-muted font-medium">
//             Total: <span className="font-bold t-text-primary">{tasks.length}</span>
//           </div>
//         </div>

//         {tasks.length === 0 ? (
//           <div className="text-center py-16 t-bg-card rounded-2xl border t-border-subtle">
//             <p className="text-4xl mb-3">📋</p>
//             <p className="t-text-muted text-sm">No tasks found.</p>
//           </div>
//         ) : (
//           <div className="rounded-2xl border t-border-subtle t-bg-card overflow-hidden shadow-sm">
//             <div className="overflow-x-auto">
//               <table className="w-full text-left border-collapse min-w-[900px]">
//                 <thead>
//                   <tr className="border-b t-border-subtle t-text-muted text-[11px] uppercase tracking-wider font-bold bg-zinc-500/5">
//                     <th className="px-6 py-4">ID</th>
//                     <th className="px-6 py-4">Task Details</th>
//                     <th className="px-6 py-4">Assignee</th>
//                     <th className="px-6 py-4">Project</th>
//                     <th className="px-6 py-4">Priority</th>
//                     <th className="px-6 py-4">Status</th>
//                     <th className="px-6 py-4">Due Date</th>
//                     <th className="px-6 py-4 text-right">Actions</th>
//                   </tr>
//                 </thead>
//                 <tbody className="divide-y t-border-subtle">
//                   {tasks.map((t) => {
//                     const overdue = isOverdue(t);
//                     return (
//                       <tr key={t.id} className={`group transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${overdue ? "bg-red-500/5" : ""}`}>
//                         <td className="px-6 py-4 text-xs font-mono t-text-muted">#{t.id}</td>
//                         <td className="px-6 py-4">
//                           <div className="flex flex-col">
//                             <span className={`font-bold text-sm ${overdue ? "text-red-500" : "t-text-primary"}`}>{t.title}</span>
//                             {t.description && <span className="text-[11px] t-text-muted line-clamp-1">{t.description}</span>}
//                           </div>
//                         </td>
//                         <td className="px-6 py-4">
//                           <div className="flex items-center gap-2">
//                             <div className="w-6 h-6 rounded-full bg-brand-500/10 flex items-center justify-center text-[10px] font-bold text-brand-500">{t.assignee?.name?.charAt(0) || "U"}</div>
//                             <span className="text-xs t-text-secondary">{t.assignee?.name || "Unassigned"}</span>
//                           </div>
//                         </td>
//                         <td className="px-6 py-4 text-xs t-text-secondary">{t.project?.title || "—"}</td>
//                         <td className="px-6 py-4">
//                           <select value={t.priority} onChange={(e) => handlePriorityUpdate(t.id, e.target.value)} className={`text-[10px] px-2 py-1 rounded-md border font-bold bg-transparent outline-none cursor-pointer ${priorityStyle[t.priority]}`}>
//                             {["Low", "Medium", "High", "Urgent"].map(p => <option key={p} value={p} className="bg-white dark:bg-zinc-900 text-black dark:text-white">{p}</option>)}
//                           </select>
//                         </td>
//                         <td className="px-6 py-4">
//                           <select value={t.status} onChange={(e) => handleStatusUpdate(t.id, e.target.value)} className={`text-[10px] px-2 py-1 rounded-md border font-bold bg-transparent outline-none cursor-pointer ${statusStyle[t.status]}`}>
//                             {["Pending", "In-Progress", "Completed"].map(s => <option key={s} value={s} className="bg-white dark:bg-zinc-900 text-black dark:text-white">{s}</option>)}
//                           </select>
//                         </td>
//                         <td className="px-6 py-4">
//                           <div className={`flex flex-col ${overdue ? "text-red-500" : "t-text-muted"}`}>
//                             <span className="text-xs font-medium">{t.dueDate}</span>
//                             {overdue && <span className="text-[9px] font-bold uppercase">Overdue</span>}
//                           </div>
//                         </td>
//                         <td className="px-6 py-4 text-right">
//                           <button onClick={() => setTimelineTaskId(t.id)} className="p-2 rounded-lg hover:bg-brand-500/10 text-brand-500 transition-colors">📜</button>
//                         </td>
//                       </tr>
//                     );
//                   })}
//                 </tbody>
//               </table>
//             </div>
//           </div>
//         )}
//       </section>

//       {/* ── Modals ────────────────────────────────────────────────────────── */}
//       {completingTask && <CompleteTaskModal taskId={completingTask.id} taskTitle={completingTask.title} currentUserName={user?.name || ""} onConfirm={handleCompleteConfirm} onCancel={() => setCompletingTask(null)} submitting={completingSubmitting} />}
//       {timelineTaskId && <TaskTimeline taskId={timelineTaskId} onClose={() => setTimelineTaskId(null)} />}
      
//       {showProjectModal && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowProjectModal(false)}>
//           <div className="rounded-2xl p-8 w-full max-w-lg shadow-2xl t-bg-card border t-border-subtle animate-slide-up" onClick={(e) => e.stopPropagation()}>
//             <h2 className="text-xl font-bold t-text-primary mb-6">Create New Project</h2>
//             <form onSubmit={handleCreateProject} className="space-y-5">
//               <div><label className={labelCls}>Title</label><input className={inputCls} style={inputStyle} value={projectForm.title} onChange={(e) => setProjectForm(p => ({ ...p, title: e.target.value }))} placeholder="Project name" /></div>
//               <div><label className={labelCls}>Description</label><textarea className={`${inputCls} min-h-[100px] resize-none`} style={inputStyle} value={projectForm.description} onChange={(e) => setProjectForm(p => ({ ...p, description: e.target.value }))} placeholder="Details..." /></div>
//               <div className="flex justify-end gap-3 pt-2">
//                 <button type="button" onClick={() => setShowProjectModal(false)} className="px-4 py-2 text-sm t-text-muted hover:t-text-primary">Cancel</button>
//                 <button type="submit" disabled={submitting} className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold">{submitting ? "Creating…" : "Create Project"}</button>
//               </div>
//             </form>
//           </div>
//         </div>
//       )}

//       {showTaskModal && (
//         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowTaskModal(false)}>
//           <div className="rounded-2xl p-8 w-full max-w-lg shadow-2xl t-bg-card border t-border-subtle animate-slide-up max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
//             <h2 className="text-xl font-bold t-text-primary mb-6">Create New Task</h2>
//             <form onSubmit={handleCreateTask} className="space-y-5">
//               <div><label className={labelCls}>Title</label><input className={inputCls} style={inputStyle} value={taskForm.title} onChange={(e) => setTaskForm(p => ({ ...p, title: e.target.value }))} placeholder="Task title" /></div>
//               <div><label className={labelCls}>Description</label><textarea className={`${inputCls} min-h-[80px] resize-none`} style={inputStyle} value={taskForm.description} onChange={(e) => setTaskForm(p => ({ ...p, description: e.target.value }))} placeholder="Task details" /></div>
//               <div><label className={labelCls}>Due Date</label><input type="date" className={inputCls} style={inputStyle} value={taskForm.dueDate} onChange={(e) => setTaskForm(p => ({ ...p, dueDate: e.target.value }))} /></div>
//               <div>
//                 <label className={labelCls}>Priority</label>
//                 <div className="grid grid-cols-4 gap-2">
//                   {["Low", "Medium", "High", "Urgent"].map(p => (
//                     <button key={p} type="button" onClick={() => setTaskForm(prev => ({ ...prev, priority: p }))} className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${taskForm.priority === p ? priorityStyle[p] : "t-text-muted t-bg-card"}`}>{p}</button>
//                   ))}
//                 </div>
//               </div>
//               <div>
//                 <label className={labelCls}>Project</label>
//                 <select className={inputCls} style={inputStyle} value={taskForm.projectId} onChange={(e) => setTaskForm(p => ({ ...p, projectId: e.target.value }))}>
//                   <option value="">Select project</option>
//                   {projects.map(pr => <option key={pr.id} value={pr.id}>{pr.title}</option>)}
//                 </select>
//               </div>
//               <div>
//                 <label className={labelCls}>Assign Member</label>
//                 <select className={inputCls} style={inputStyle} value={taskForm.assignedTo} onChange={(e) => setTaskForm(p => ({ ...p, assignedTo: e.target.value }))}>
//                   <option value="">Select member</option>
//                   {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
//                 </select>
//               </div>
//               <div className="flex justify-end gap-3 pt-2">
//                 <button type="button" onClick={() => setShowTaskModal(false)} className="px-4 py-2 text-sm t-text-muted hover:t-text-primary">Cancel</button>
//                 <button type="submit" disabled={submitting} className="px-5 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold">{submitting ? "Creating…" : "Create Task"}</button>
//               </div>
//             </form>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }





// "use client";
// import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
// import toast from "react-hot-toast";
// import API from "@/lib/axios";
// import SkeletonLoader from "@/components/SkeletonLoader";
// import TaskFilters, { type FilterState } from "@/components/TaskFilters";
// import TaskTimeline from "@/components/TaskTimeline";
// import CompleteTaskModal from "@/components/CompleteTaskModal";
// import { useTheme } from "@/context/ThemeContext";
// import { useAuth } from "@/context/AuthContext";
// interface Member { id: number; name: string; email: string }
// interface Task {
//   id: number;
//   title: string;
//   description?: string;
//   status: string;
//   priority: string;
//   dueDate: string;
//   completedBy?: string;
//   completedAt?: string;
//   assignee?: Member;
//   project?: { id: number; title: string }
// }
// interface Project {
//   id: number;
//   title: string;
//   description: string;
//   tasks?: Task[];
//   creator?: { id: number; name: string; email: string }
// }
// const isOverdue = (task: Task) =>
//   task.status !== "Completed" && new Date(task.dueDate) < new Date(new Date().toDateString());
// const statusStyle: Record<string, string> = {
//   Pending: "bg-amber-500/15 text-amber-500 border-amber-500/20",
//   "In-Progress": "bg-blue-500/15 text-blue-500 border-blue-500/20",
//   Completed: "bg-emerald-500/15 text-emerald-500 border-emerald-500/20",
// };
// const priorityStyle: Record<string, string> = {
//   Low: "bg-gray-500/15 text-gray-500 border-gray-500/20",
//   Medium: "bg-blue-500/15 text-blue-500 border-blue-500/20",
//   High: "bg-orange-500/15 text-orange-500 border-orange-500/20",
//   Urgent: "bg-red-500/15 text-red-500 border-red-500/20",
// };
// const priorityIcon: Record<string, string> = {
//   Low: "▽",
//   Medium: "◆",
//   High: "▲",
//   Urgent: "🔥",
// };
// const DEFAULT_FILTERS: FilterState = {
//   search: "",
//   statuses: [],
//   priorities: [],
//   sortBy: "createdAt",
//   sortOrder: "DESC",
//   overdue: false,
// };

// // Native dialog keeps the overlay above transformed/animated dashboard containers.
// function CreationDialog({ title, subtitle, isDark, busy, onClose, children }: {
//   title: string; subtitle: string; isDark: boolean; busy: boolean;
//   onClose: () => void; children: ReactNode;
// }) {
//   const ref = useRef<HTMLDialogElement>(null);
//   useEffect(() => {
//     const dialog = ref.current;
//     const previousFocus = document.activeElement as HTMLElement | null;
//     const previousOverflow = document.body.style.overflow;
//     dialog?.showModal();
//     document.body.style.overflow = "hidden";
//     return () => {
//       dialog?.close();
//       document.body.style.overflow = previousOverflow;
//       previousFocus?.focus();
//     };
//   }, []);
//   return (
//     <dialog ref={ref} className="creation-dialog" data-theme={isDark ? "dark" : "light"}
//       aria-labelledby="creation-title" aria-describedby="creation-description"
//       aria-busy={busy}
//       onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
//       onClick={(event) => {
//         if (event.target !== event.currentTarget || busy) return;
//         const bounds = event.currentTarget.getBoundingClientRect();
//         if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
//       }}>
//       <header className="creation-header">
//         <div className="creation-icon" aria-hidden="true">
//           <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
//             <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" />
//           </svg>
//         </div>
//         <div className="creation-heading"><h2 id="creation-title">{title}</h2><p id="creation-description">{subtitle}</p></div>
//         <button type="button" className="creation-close" aria-label="Close dialog" disabled={busy} onClick={onClose}>
//           <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
//         </button>
//       </header>
//       {children}
//       <style>{`
//         .creation-dialog { --surface:#fff; --field:#f8fafc; --line:#e2e8f0; --text:#0f172a; --muted:#64748b; --accent:#4f46e5; color-scheme:light; box-sizing:border-box; position:fixed; inset:0; margin:auto; padding:0; width:calc(100% - 32px); max-width:620px; max-height:calc(100dvh - 32px); overflow-y:auto; overscroll-behavior:contain; background:var(--surface); color:var(--text); border:1px solid var(--line); border-radius:20px; box-shadow:0 28px 80px -20px rgba(15,23,42,.45); }
//         .creation-dialog[data-theme="dark"] { --surface:#111827; --field:#172033; --line:#334155; --text:#f1f5f9; --muted:#94a3b8; --accent:#818cf8; color-scheme:dark; }
//         .creation-dialog::backdrop { background:rgba(15,23,42,.52); backdrop-filter:blur(5px); }
//         .creation-dialog * { box-sizing:border-box; }
//         .creation-header { display:flex; align-items:flex-start; gap:14px; padding:26px 28px; border-bottom:1px solid var(--line); }
//         .creation-icon { display:grid; place-items:center; flex-shrink:0; width:44px; height:44px; border-radius:12px; background:rgba(99,102,241,.12); color:var(--accent); }
//         .creation-heading { flex:1; min-width:0; }
//         .creation-heading h2 { margin:0; font-size:21px; line-height:1.4; font-weight:700; letter-spacing:-.5px; color:var(--text); }
//         .creation-heading p { margin:5px 0 0; font-size:13px; line-height:1.6; color:var(--muted); }
//         .creation-close { display:grid; place-items:center; flex-shrink:0; padding:7px; border:0; border-radius:8px; background:transparent; color:var(--muted); cursor:pointer; }
//         .creation-close:hover { background:var(--field); color:var(--text); }
//         .creation-fields { display:grid; gap:20px; padding:24px 28px 28px; margin:0; border:0; min-width:0; }
//         .creation-note { margin:0; font-size:12px; color:var(--muted); }
//         .creation-label { display:block; margin-bottom:8px; font-size:13px; font-weight:600; color:var(--text); }
//         .creation-label span { color:var(--muted); font-weight:400; }
//         .creation-input { display:block; width:100%; min-width:0; min-height:46px; padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:var(--field); color:var(--text); font:inherit; font-size:14px; line-height:1.5; outline:none; transition:border-color .15s, box-shadow .15s; }
//         .creation-input::placeholder { color:var(--muted); opacity:1; }
//         .creation-input:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(99,102,241,.16); }
//         textarea.creation-input { min-height:112px; resize:vertical; }
//         .creation-input option { background:var(--surface); color:var(--text); }
//         .creation-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
//         .creation-priorities { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
//         .creation-priority { min-height:42px; padding:8px 4px; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--muted); font-size:12px; font-weight:600; cursor:pointer; }
//         .creation-priority[aria-pressed="true"] { border-color:var(--accent); background:rgba(99,102,241,.12); color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
//         .creation-footer { display:flex; align-items:center; justify-content:flex-end; gap:12px; padding:18px 28px; border-top:1px solid var(--line); background:var(--field); }
//         .creation-button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:11px 20px; border:1px solid var(--line); border-radius:10px; background:var(--surface); color:var(--text); font-size:13px; font-weight:600; cursor:pointer; transition:background .15s; }
//         .creation-button:hover { background:var(--field); }
//         .creation-button-primary { background:#4f46e5; border-color:#4f46e5; color:white; box-shadow:0 3px 8px rgba(79,70,229,.18); }
//         .creation-button-primary:hover { background:#4338ca; }
//         .creation-dialog button:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
//         .creation-dialog button:disabled, .creation-dialog fieldset:disabled { opacity:.6; cursor:wait; }
//         @media(max-width:540px) { .creation-dialog { width:calc(100% - 24px); max-height:calc(100dvh - 24px); border-radius:16px; } .creation-header { padding:20px; gap:10px; } .creation-heading h2 { font-size:19px; } .creation-fields { padding:20px; gap:18px; } .creation-grid { grid-template-columns:1fr; } .creation-footer { padding:16px 20px; } .creation-button { flex:1; padding:11px 12px; } }
//       `}</style>
//     </dialog>
//   );
// }

// export default function AdminDashboard() {
//   const { isDark } = useTheme();
//   const { user } = useAuth();
//   const [projects, setProjects] = useState<Project[]>([]);
//   const [tasks, setTasks] = useState<Task[]>([]);
//   const [members, setMembers] = useState<Member[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
//   const [timelineTaskId, setTimelineTaskId] = useState<number | null>(null);
//   const [showProjectModal, setShowProjectModal] = useState(false);
//   const [showTaskModal, setShowTaskModal] = useState(false);
//   const [submitting, setSubmitting] = useState(false);
//   const [completingTask, setCompletingTask] = useState<Task | null>(null);
//   const [completingSubmitting, setCompletingSubmitting] = useState(false);
//   const [projectForm, setProjectForm] = useState({ title: "", description: "" });
//   const [taskForm, setTaskForm] = useState({ title: "", description: "", dueDate: "", projectId: "", assignedTo: "", priority: "Medium" });
//   const fetchData = useCallback(async () => {
//     try {
//       setLoading(true);
//       const params = new URLSearchParams();
//       if (filters.search) params.set("search", filters.search);
//       if (filters.statuses.length > 0) params.set("status", filters.statuses.join(","));
//       if (filters.priorities.length > 0) params.set("priority", filters.priorities.join(","));
//       if (filters.overdue) params.set("overdue", "true");
//       params.set("sortBy", filters.sortBy);
//       params.set("sortOrder", filters.sortOrder);
//       const [pRes, tRes, mRes] = await Promise.all([
//         API.get("/projects"),
//         API.get(`/tasks?${params.toString()}`),
//         API.get("/users/members"),
//       ]);
//       setProjects(pRes.data.data.projects || []);
//       setTasks(tRes.data.data.tasks || []);
//       setMembers(mRes.data.data.members || []);
//     } catch { toast.error("Failed to fetch dashboard data."); }
//     finally { setLoading(false); }
//   }, [filters]);
//   useEffect(() => { fetchData(); }, [fetchData]);
//   const handleCreateProject = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!projectForm.title.trim() || !projectForm.description.trim()) { toast.error("All fields are required."); return; }
//     try {
//       setSubmitting(true);
//       const { data } = await API.post("/projects", projectForm);
//       if (data.success) { toast.success("Project created!"); setShowProjectModal(false); setProjectForm({ title: "", description: "" }); fetchData(); }
//     } catch (err: any) {
//       toast.error(err.response?.data?.message || "Failed to create project.");
//     } finally { setSubmitting(false); }
//   };
//   const handleCreateTask = async (e: React.FormEvent) => {
//     e.preventDefault();
//     if (!taskForm.title.trim() || !taskForm.dueDate || !taskForm.projectId || !taskForm.assignedTo) { toast.error("Please fill all required fields."); return; }
//     try {
//       setSubmitting(true);
//       const { data } = await API.post("/tasks", {
//         ...taskForm,
//         projectId: Number(taskForm.projectId),
//         assignedTo: Number(taskForm.assignedTo),
//       });
//       if (data.success) { toast.success("Task created & assigned!"); setShowTaskModal(false); setTaskForm({ title: "", description: "", dueDate: "", projectId: "", assignedTo: "", priority: "Medium" }); fetchData(); }
//     } catch (err: any) {
//       toast.error(err.response?.data?.message || "Failed to create task.");
//     } finally { setSubmitting(false); }
//   };
//   const handlePriorityUpdate = async (taskId: number, newPriority: string) => {
//     try {
//       const { data } = await API.put(`/tasks/${taskId}/priority`, { priority: newPriority });
//       if (data.success) {
//         toast.success(`Priority updated to "${newPriority}"`);
//         setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, priority: newPriority } : t)));
//       }
//     } catch (err: any) {
//       toast.error(err.response?.data?.message || "Failed to update priority.");
//     }
//   };
//   const handleStatusUpdate = async (taskId: number, newStatus: string) => {
//     if (newStatus === "Completed") {
//       const task = tasks.find((t) => t.id === taskId);
//       if (task) setCompletingTask(task);
//       return;
//     }
//     try {
//       const { data } = await API.put(`/tasks/${taskId}/status`, { status: newStatus });
//       if (data.success) {
//         toast.success(`Status updated to "${newStatus}"`);
//         setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t)));
//       }
//     } catch (err: any) {
//       toast.error(err.response?.data?.message || "Failed to update status.");
//     }
//   };
//   const handleCompleteConfirm = async ({ completedBy, completedAt }: { completedBy: string; completedAt: string }) => {
//     if (!completingTask) return;
//     try {
//       setCompletingSubmitting(true);
//       const { data } = await API.put(`/tasks/${completingTask.id}/status`, {
//         status: "Completed",
//         completedBy,
//         completedAt,
//       });
//       if (data.success) {
//         toast.success(`Task "${completingTask.title}" marked as completed!`);
//         setTasks((prev) => prev.map((t) => t.id === completingTask.id ? { ...t, status: "Completed", completedBy, completedAt } : t));
//         setCompletingTask(null);
//       }
//     } catch (err: any) {
//       toast.error(err.response?.data?.message || "Failed to complete task.");
//     } finally {
//       setCompletingSubmitting(false);
//     }
//   };
//   const overdueCount = tasks.filter(isOverdue).length;
//   if (loading && tasks.length === 0 && !showProjectModal && !showTaskModal) return <SkeletonLoader count={6} />;
//   return (
//     <div className="space-y-8 animate-fade-in">
//       {/* ── Stats Row ─────────────────────────────────────────────────────── */}
//       <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
//         {[
//           { label: "Projects", value: projects.length, color: "from-indigo-500 to-indigo-700", icon: "📁" },
//           { label: "Tasks", value: tasks.length, color: "from-violet-500 to-violet-700", icon: "✅" },
//           { label: "Members", value: members.length, color: "from-emerald-500 to-emerald-700", icon: "👥" },
//           { label: "Overdue", value: overdueCount, color: overdueCount > 0 ? "from-red-500 to-red-700" : "from-gray-500 to-gray-700", icon: "⚠" },
//         ].map((s) => (
//           <div key={s.label} className="rounded-2xl p-4 flex items-center gap-3 border t-border-subtle t-bg-card transition-colors light-shadow">
//             <div className={`w-11 h-11 rounded-xl bg-linear-to-br ${s.color} flex items-center justify-center text-white font-bold text-sm shadow-lg`}>{s.icon}</div>
//             <div>
//               <p className="text-lg font-bold t-text-primary">{s.value}</p>
//               <p className="text-xs t-text-muted">{s.label}</p>
//             </div>
//           </div>
//         ))}
//       </div>
//       {/* ── Action Buttons ────────────────────────────────────────────────── */}
//       <div className="flex flex-wrap gap-3">
//         <button onClick={() => setShowProjectModal(true)} className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow-sm hover:bg-indigo-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 transition-colors cursor-pointer">+ New Project</button>
//         <button onClick={() => setShowTaskModal(true)} className={`px-5 py-2.5 rounded-xl border text-sm font-semibold shadow-sm transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${isDark ? "bg-slate-800 border-slate-600 text-slate-100 hover:bg-slate-700" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"}`}>+ New Task</button>
//       </div>
//       {/* ── Task Filters ──────────────────────────────────────────────────── */}
//       <TaskFilters filters={filters} onChange={setFilters} taskCount={tasks.length} />
//       {/* ── Projects ──────────────────────────────────────────────────────── */}
//       <section>
//         <h2 className="text-xl font-bold t-text-primary mb-4">Projects</h2>
//         {projects.length === 0 ? (
//           <p className="t-text-muted text-sm italic">No projects created yet.</p>
//         ) : (
//           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//             {projects.map(p => (
//               <div key={p.id} className="p-5 rounded-2xl border t-border-subtle t-bg-card light-shadow">
//                 <div className="flex justify-between items-start mb-2">
//                   <h3 className="font-bold text-sm t-text-primary">{p.title}</h3>
//                   <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 font-bold border border-indigo-500/10">{p.tasks?.length || 0} tasks</span>
//                 </div>
//                 <p className="text-xs t-text-secondary line-clamp-2 mb-4">{p.description}</p>
//                 <div className="pt-3 border-t t-border-subtle flex justify-between items-center">
//                   <span className="text-[10px] t-text-muted">By {p.creator?.name || "System"}</span>
//                 </div>
//               </div>
//             ))}
//           </div>
//         )}
//       </section>
//       {/* ── Tasks Table ────────────────────────────────────────────────────── */}
//       <section>
//         <div className="flex items-center justify-between mb-4">
//           <h2 className="text-xl font-bold t-text-primary">All Tasks</h2>
//           <div className="text-xs t-text-muted font-medium">
//             Total: <span className="font-bold t-text-primary">{tasks.length}</span>
//           </div>
//         </div>
//         {tasks.length === 0 ? (
//           <div className="text-center py-16 t-bg-card rounded-2xl border t-border-subtle">
//             <p className="text-4xl mb-3">📋</p>
//             <p className="t-text-muted text-sm">No tasks found.</p>
//           </div>
//         ) : (
//           <div className="rounded-2xl border t-border-subtle t-bg-card overflow-hidden shadow-sm">
//             <div className="overflow-x-auto">
//               <table className="w-full text-left border-collapse min-w-[900px]">
//                 <thead>
//                   <tr className="border-b t-border-subtle t-text-muted text-[11px] uppercase tracking-wider font-bold bg-zinc-500/5">
//                     <th className="px-6 py-4">ID</th>
//                     <th className="px-6 py-4">Task Details</th>
//                     <th className="px-6 py-4">Assignee</th>
//                     <th className="px-6 py-4">Project</th>
//                     <th className="px-6 py-4">Priority</th>
//                     <th className="px-6 py-4">Status</th>
//                     <th className="px-6 py-4">Due Date</th>
//                     <th className="px-6 py-4 text-right">Actions</th>
//                   </tr>
//                 </thead>
//                 <tbody className="divide-y t-border-subtle">
//                   {tasks.map((t) => {
//                     const overdue = isOverdue(t);
//                     return (
//                       <tr key={t.id} className={`group transition-colors hover:bg-black/5 dark:hover:bg-white/5 ${overdue ? "bg-red-500/5" : ""}`}>
//                         <td className="px-6 py-4 text-xs font-mono t-text-muted">#{t.id}</td>
//                         <td className="px-6 py-4">
//                           <div className="flex flex-col">
//                             <span className={`font-bold text-sm ${overdue ? "text-red-500" : "t-text-primary"}`}>{t.title}</span>
//                             {t.description && <span className="text-[11px] t-text-muted line-clamp-1">{t.description}</span>}
//                           </div>
//                         </td>
//                         <td className="px-6 py-4">
//                           <div className="flex items-center gap-2">
//                             <div className="w-6 h-6 rounded-full bg-brand-500/10 flex items-center justify-center text-[10px] font-bold text-brand-500">{t.assignee?.name?.charAt(0) || "U"}</div>
//                             <span className="text-xs t-text-secondary">{t.assignee?.name || "Unassigned"}</span>
//                           </div>
//                         </td>
//                         <td className="px-6 py-4 text-xs t-text-secondary">{t.project?.title || "—"}</td>
//                         <td className="px-6 py-4">
//                           <select value={t.priority} onChange={(e) => handlePriorityUpdate(t.id, e.target.value)} className={`text-[10px] px-2 py-1 rounded-md border font-bold bg-transparent outline-none cursor-pointer ${priorityStyle[t.priority]}`}>
//                             {["Low", "Medium", "High", "Urgent"].map(p => <option key={p} value={p} className="bg-white dark:bg-zinc-900 text-black dark:text-white">{p}</option>)}
//                           </select>
//                         </td>
//                         <td className="px-6 py-4">
//                           <select value={t.status} onChange={(e) => handleStatusUpdate(t.id, e.target.value)} className={`text-[10px] px-2 py-1 rounded-md border font-bold bg-transparent outline-none cursor-pointer ${statusStyle[t.status]}`}>
//                             {["Pending", "In-Progress", "Completed"].map(s => <option key={s} value={s} className="bg-white dark:bg-zinc-900 text-black dark:text-white">{s}</option>)}
//                           </select>
//                         </td>
//                         <td className="px-6 py-4">
//                           <div className={`flex flex-col ${overdue ? "text-red-500" : "t-text-muted"}`}>
//                             <span className="text-xs font-medium">{t.dueDate}</span>
//                             {overdue && <span className="text-[9px] font-bold uppercase">Overdue</span>}
//                           </div>
//                         </td>
//                         <td className="px-6 py-4 text-right">
//                           <button onClick={() => setTimelineTaskId(t.id)} className="p-2 rounded-lg hover:bg-brand-500/10 text-brand-500 transition-colors">📜</button>
//                         </td>
//                       </tr>
//                     );
//                   })}
//                 </tbody>
//               </table>
//             </div>
//           </div>
//         )}
//       </section>
//       {/* ── Modals ────────────────────────────────────────────────────────── */}
//       {completingTask && <CompleteTaskModal taskId={completingTask.id} taskTitle={completingTask.title} currentUserName={user?.name || ""} onConfirm={handleCompleteConfirm} onCancel={() => setCompletingTask(null)} submitting={completingSubmitting} />}
//       {timelineTaskId && <TaskTimeline taskId={timelineTaskId} onClose={() => setTimelineTaskId(null)} />}
//       {showProjectModal && (
//         <CreationDialog title="Create new project" subtitle="Give your team's next project a clear starting point." isDark={isDark} busy={submitting} onClose={() => setShowProjectModal(false)}>
//           <form onSubmit={handleCreateProject}>
//             <fieldset className="creation-fields" disabled={submitting}>
//               <p className="creation-note">All fields are required.</p>
//               <div><label className="creation-label" htmlFor="project-title">Project name</label><input id="project-title" autoFocus required className="creation-input" value={projectForm.title} onChange={(e) => setProjectForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Company website redesign" /></div>
//               <div><label className="creation-label" htmlFor="project-description">Description</label><textarea id="project-description" required className="creation-input" value={projectForm.description} onChange={(e) => setProjectForm(p => ({ ...p, description: e.target.value }))} placeholder="Outline the goals, scope, and expected outcome…" /></div>
//             </fieldset>
//             <div className="creation-footer">
//               <button type="button" disabled={submitting} onClick={() => setShowProjectModal(false)} className="creation-button">Cancel</button>
//               <button type="submit" disabled={submitting} className="creation-button creation-button-primary">{submitting ? "Creating…" : "Create project"}</button>
//             </div>
//           </form>
//         </CreationDialog>
//       )}
//       {showTaskModal && (
//         <CreationDialog title="Create new task" subtitle="Define the work, assign an owner, and set a deadline." isDark={isDark} busy={submitting} onClose={() => setShowTaskModal(false)}>
//           <form onSubmit={handleCreateTask}>
//             <fieldset className="creation-fields" disabled={submitting}>
//               <p className="creation-note">All fields are required unless marked optional.</p>
//               <div><label className="creation-label" htmlFor="task-title">Task title</label><input id="task-title" autoFocus required className="creation-input" value={taskForm.title} onChange={(e) => setTaskForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Design the homepage layout" /></div>
//               <div><label className="creation-label" htmlFor="task-description">Description <span>(optional)</span></label><textarea id="task-description" className="creation-input" value={taskForm.description} onChange={(e) => setTaskForm(p => ({ ...p, description: e.target.value }))} placeholder="Add context, requirements, or acceptance criteria…" /></div>
//               <div className="creation-grid">
//                 <div><label className="creation-label" htmlFor="task-project">Project</label><select id="task-project" required className="creation-input" value={taskForm.projectId} onChange={(e) => setTaskForm(p => ({ ...p, projectId: e.target.value }))}><option value="">Select a project</option>{projects.map(pr => <option key={pr.id} value={pr.id}>{pr.title}</option>)}</select>{projects.length === 0 && <p className="creation-note">Create a project before adding a task.</p>}</div>
//                 <div><label className="creation-label" htmlFor="task-assignee">Assign member</label><select id="task-assignee" required className="creation-input" value={taskForm.assignedTo} onChange={(e) => setTaskForm(p => ({ ...p, assignedTo: e.target.value }))}><option value="">Select a member</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>{members.length === 0 && <p className="creation-note">No members are available to assign.</p>}</div>
//               </div>
//               <div><label className="creation-label" htmlFor="task-due-date">Due date</label><input id="task-due-date" required type="date" className="creation-input" value={taskForm.dueDate} onChange={(e) => setTaskForm(p => ({ ...p, dueDate: e.target.value }))} /></div>
//               <div role="group" aria-labelledby="task-priority-label"><span className="creation-label" id="task-priority-label">Priority</span><div className="creation-priorities">{["Low", "Medium", "High", "Urgent"].map(p => <button key={p} type="button" aria-pressed={taskForm.priority === p} onClick={() => setTaskForm(prev => ({ ...prev, priority: p }))} className="creation-priority">{p}</button>)}</div></div>
//             </fieldset>
//             <div className="creation-footer">
//               <button type="button" disabled={submitting} onClick={() => setShowTaskModal(false)} className="creation-button">Cancel</button>
//               <button type="submit" disabled={submitting || projects.length === 0 || members.length === 0} className="creation-button creation-button-primary">{submitting ? "Creating…" : "Create task"}</button>
//             </div>
//           </form>
//         </CreationDialog>
//       )}
//     </div>
//   );
// }


"use client";
import { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import SkeletonLoader from "@/components/SkeletonLoader";
import type { FilterState } from "@/components/TaskFilters";
import TaskTimeline from "@/components/TaskTimeline";
import CompleteTaskModal from "@/components/CompleteTaskModal";
import TeamMemberOverview from "@/components/TeamMemberOverview";
import { TaskProgressControl } from "@/components/TaskProgress";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
interface Member { id: number; name: string; email: string }
const requestedMemberNames = ["Ramesh", "Dishal", "Priyanka", "Rashi", "Dhruv", "Nisha"];
interface Task {
  id: number;
  title: string;
  description?: string;
  status: string;
  progress: number;
  priority: string;
  dueDate: string;
  projectId?: number;
  createdAt?: string;
  created_at?: string;
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
const DEFAULT_FILTERS: FilterState = {
  search: "",
  statuses: [],
  priorities: [],
  sortBy: "createdAt",
  sortOrder: "DESC",
  overdue: false,
};

// Native dialog keeps the overlay above transformed/animated dashboard containers.
function CreationDialog({ title, subtitle, isDark, busy, onClose, children }: {
  title: string; subtitle: string; isDark: boolean; busy: boolean;
  onClose: () => void; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog ref={ref} className="creation-dialog" data-theme={isDark ? "dark" : "light"}
      aria-labelledby="creation-title" aria-describedby="creation-description"
      aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget || busy) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}>
      <header className="creation-header">
        <div className="creation-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="4" width="16" height="16" rx="4" /><path d="M12 8v8M8 12h8" />
          </svg>
        </div>
        <div className="creation-heading"><h2 id="creation-title">{title}</h2><p id="creation-description">{subtitle}</p></div>
        <button type="button" className="creation-close" aria-label="Close dialog" disabled={busy} onClick={onClose}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </header>
      {children}
      <style>{`
        .creation-dialog { --surface:#fff; --field:#f8fafc; --line:#e2e8f0; --text:#0f172a; --muted:#64748b; --accent:#4f46e5; color-scheme:light; box-sizing:border-box; position:fixed; inset:0; margin:auto; padding:0; width:calc(100% - 32px); max-width:620px; max-height:calc(100dvh - 32px); overflow-y:auto; overscroll-behavior:contain; background:var(--surface); color:var(--text); border:1px solid var(--line); border-radius:20px; box-shadow:0 28px 80px -20px rgba(15,23,42,.45); }
        .creation-dialog[data-theme="dark"] { --surface:#111827; --field:#172033; --line:#334155; --text:#f1f5f9; --muted:#94a3b8; --accent:#818cf8; color-scheme:dark; }
        .creation-dialog::backdrop { background:rgba(15,23,42,.52); backdrop-filter:blur(5px); }
        .creation-dialog * { box-sizing:border-box; }
        .creation-header { display:flex; align-items:flex-start; gap:14px; padding:26px 28px; border-bottom:1px solid var(--line); }
        .creation-icon { display:grid; place-items:center; flex-shrink:0; width:44px; height:44px; border-radius:12px; background:rgba(99,102,241,.12); color:var(--accent); }
        .creation-heading { flex:1; min-width:0; }
        .creation-heading h2 { margin:0; font-size:21px; line-height:1.4; font-weight:700; letter-spacing:-.5px; color:var(--text); }
        .creation-heading p { margin:5px 0 0; font-size:13px; line-height:1.6; color:var(--muted); }
        .creation-close { display:grid; place-items:center; flex-shrink:0; padding:7px; border:0; border-radius:8px; background:transparent; color:var(--muted); cursor:pointer; }
        .creation-close:hover { background:var(--field); color:var(--text); }
        .creation-fields { display:grid; gap:20px; padding:24px 28px 28px; margin:0; border:0; min-width:0; }
        .creation-note { margin:0; font-size:12px; color:var(--muted); }
        .creation-label { display:block; margin-bottom:8px; font-size:13px; font-weight:600; color:var(--text); }
        .creation-label span { color:var(--muted); font-weight:400; }
        .creation-input { display:block; width:100%; min-width:0; min-height:46px; padding:12px 14px; border:1px solid var(--line); border-radius:10px; background:var(--field); color:var(--text); font:inherit; font-size:14px; line-height:1.5; outline:none; transition:border-color .15s, box-shadow .15s; }
        .creation-input::placeholder { color:var(--muted); opacity:1; }
        .creation-input:focus { border-color:var(--accent); box-shadow:0 0 0 3px rgba(99,102,241,.16); }
        textarea.creation-input { min-height:112px; resize:vertical; }
        .creation-input option { background:var(--surface); color:var(--text); }
        .creation-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:18px; }
        .creation-priorities { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; }
        .creation-priority { min-height:42px; padding:8px 4px; border:1px solid var(--line); border-radius:9px; background:var(--surface); color:var(--muted); font-size:12px; font-weight:600; cursor:pointer; }
        .creation-priority[aria-pressed="true"] { border-color:var(--accent); background:rgba(99,102,241,.12); color:var(--accent); box-shadow:0 0 0 1px var(--accent); }
        .creation-footer { display:flex; align-items:center; justify-content:flex-end; gap:12px; padding:18px 28px; border-top:1px solid var(--line); background:var(--field); }
        .creation-button { display:inline-flex; align-items:center; justify-content:center; gap:8px; min-height:44px; padding:11px 20px; border:1px solid var(--line); border-radius:10px; background:var(--surface); color:var(--text); font-size:13px; font-weight:600; cursor:pointer; transition:background .15s; }
        .creation-button:hover { background:var(--field); }
        .creation-button-primary { background:#4f46e5; border-color:#4f46e5; color:white; box-shadow:0 3px 8px rgba(79,70,229,.18); }
        .creation-button-primary:hover { background:#4338ca; }
        .creation-dialog button:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
        .creation-dialog button:disabled, .creation-dialog fieldset:disabled { opacity:.6; cursor:wait; }
        @media(max-width:540px) { .creation-dialog { width:calc(100% - 24px); max-height:calc(100dvh - 24px); border-radius:16px; } .creation-header { padding:20px; gap:10px; } .creation-heading h2 { font-size:19px; } .creation-fields { padding:20px; gap:18px; } .creation-grid { grid-template-columns:1fr; } .creation-footer { padding:16px 20px; } .creation-button { flex:1; padding:11px 12px; } }
      `}</style>
    </dialog>
  );
}


function formatDate(value: string) {
  if (!value) return "No due date";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function ProgressCircle({ completed, total, label, size }: { completed: number; total: number; label: string; size: number }) {
  const percentage = total ? Math.min(100, Math.max(0, Math.round(completed / total * 100))) : 0;
  return <div className="aw-ring" style={{ width: size, height: size }} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} aria-valuetext={total ? `${percentage} percent, ${completed} of ${total} tasks completed` : "No tasks yet"}><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="42" className="aw-ring-track" /><circle cx="50" cy="50" r="42" pathLength="100" className="aw-ring-value" strokeDasharray={`${percentage} 100`} transform="rotate(-90 50 50)" style={{ opacity: percentage ? 1 : 0 }} /></svg><div><strong style={{ fontSize: size > 100 ? 30 : 18 }}>{percentage}%</strong>{size > 100 && <span>{total ? "completed" : "no tasks yet"}</span>}</div></div>;
}
function DashboardStyles() {
  return <style>{`
    .admin-workspace { --aw-bg:#f1f5f9; --aw-card:#fff; --aw-field:#f8fafc; --aw-text:#0f172a; --aw-muted:#526176; --aw-line:#dce3ed; --aw-accent:#4338ca; --aw-soft:#eef2ff; --aw-danger:#b91c1c; color-scheme:light; background:var(--aw-bg); color:var(--aw-text); border-radius:22px; padding:28px; display:grid; gap:28px; min-width:0; font-size:14px; line-height:1.5; }
    .admin-workspace[data-theme="dark"] { --aw-bg:#0b1220; --aw-card:#141e2f; --aw-field:#1c293e; --aw-text:#f1f5f9; --aw-muted:#b0bdd0; --aw-line:#33435b; --aw-accent:#a5b4fc; --aw-soft:#253257; --aw-danger:#fca5a5; color-scheme:dark; }
    .admin-workspace * { box-sizing:border-box; }
    .admin-workspace h1,.admin-workspace h2,.admin-workspace h3,.admin-workspace p { margin:0; }
    .admin-workspace h1 { font-size:30px; font-weight:750; letter-spacing:-1px; margin:5px 0 6px; color:var(--aw-text); }
    .admin-workspace h2 { font-size:18px; font-weight:700; color:var(--aw-text); }
    .admin-workspace h3 { font-size:16px; font-weight:650; color:var(--aw-text); overflow-wrap:anywhere; }
    .admin-workspace .aw-muted { color:var(--aw-muted); }
    .admin-workspace .aw-small { font-size:12px; }
    .admin-workspace .aw-danger { color:var(--aw-danger); }
    .admin-workspace .aw-eyebrow { color:var(--aw-accent); font-size:10px; font-weight:750; letter-spacing:1.6px; margin-bottom:8px; }
    .aw-header,.aw-section-heading,.aw-actions,.aw-pagination { display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
    .aw-actions { justify-content:flex-start; gap:10px; }
    .aw-section-heading { margin-bottom:16px; }
    .aw-section-heading p { margin-top:4px; }
    .aw-card { min-width:0; border:1px solid var(--aw-line); border-radius:16px; background:var(--aw-card); box-shadow:0 2px 6px rgba(15,23,42,.025); }
    .aw-stats { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; }
    .aw-stat { padding:20px; display:grid; gap:6px; }
    .aw-stat strong { font-size:32px; line-height:1.25; font-weight:750; color:var(--aw-text); }
    .aw-stat>span { font-size:12px; }
    .aw-overview { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
    .aw-completion { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:26px; }
    .aw-completion .aw-small { margin-top:16px; line-height:1.7; }
    .aw-completion h2 { margin-bottom:6px; }
    .aw-ring { position:relative; flex-shrink:0; }
    .aw-ring svg { width:100%; height:100%; display:block; fill:none; stroke-width:7; }
    .aw-ring-track { stroke:var(--aw-line); }
    .aw-ring-value { stroke:var(--aw-accent); stroke-linecap:round; transition:stroke-dasharray .4s ease; }
    .aw-ring>div { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; flex-direction:column; }
    .aw-ring strong { color:var(--aw-text); font-weight:750; letter-spacing:-.8px; line-height:1.2; }
    .aw-ring span { color:var(--aw-muted); font-size:11px; margin-top:3px; }
    .aw-breakdown { padding:24px; }
    .aw-status-row { display:flex; align-items:center; gap:10px; width:100%; min-height:43px; background:transparent; border:0; color:var(--aw-text); cursor:pointer; font:inherit; text-align:left; padding:6px 0; }
    .aw-status-row>span:nth-child(2) { width:85px; font-size:13px; }
    .aw-status-row strong { min-width:28px; text-align:right; }
    .aw-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
    .aw-track { flex:1; height:7px; background:var(--aw-line); border-radius:10px; overflow:hidden; }
    .aw-track span { display:block; height:100%; border-radius:10px; }
    .aw-complete { background:#10b981; } .aw-active { background:#6366f1; } .aw-pending { background:#f59e0b; }
    .aw-projects { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:18px; }
    .aw-project { padding:22px; display:flex; flex-direction:column; }
    .aw-project-top { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:18px; }
    .aw-project-icon { display:grid; place-items:center; width:40px; height:40px; border-radius:10px; background:var(--aw-soft); color:var(--aw-accent); }
    .aw-pill { padding:4px 9px; border:1px solid var(--aw-line); border-radius:7px; background:var(--aw-field); font-size:11px; font-weight:600; color:var(--aw-muted); }
    .aw-project .aw-project-description { margin-top:7px; font-size:13px; line-height:1.65; overflow-wrap:anywhere; }
    .aw-project-progress { display:flex; align-items:center; gap:14px; margin-top:auto; padding:20px 0; }
    .aw-project-progress strong { font-size:13px; color:var(--aw-text); }
    .aw-project footer { border-top:1px solid var(--aw-line); padding-top:14px; display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
    .admin-workspace .aw-button { font:inherit; font-size:13px; font-weight:600; background:var(--aw-card); color:var(--aw-text); border:1px solid var(--aw-line); border-radius:9px; padding:10px 15px; min-height:40px; cursor:pointer; white-space:nowrap; }
    .admin-workspace .aw-button:hover { background:var(--aw-field); }
    .admin-workspace .aw-primary { background:#4f46e5; border-color:#4f46e5; color:white; }
    .admin-workspace .aw-primary:hover { background:#4338ca; }
    .admin-workspace .aw-link { background:none; border:0; padding:5px 0; font:inherit; font-size:12px; font-weight:650; color:var(--aw-accent); cursor:pointer; }
    .admin-workspace .aw-link:hover { text-decoration:underline; }
    .admin-workspace button:disabled { opacity:.55; cursor:not-allowed; }
    .admin-workspace :is(button,input,select,[tabindex]):focus-visible { outline:2px solid var(--aw-accent); outline-offset:3px; }
    .aw-task-section { scroll-margin-top:24px; min-width:0; }
    .aw-task-card { overflow:hidden; }
    .aw-filters { display:grid; grid-template-columns:2fr repeat(4,minmax(100px,1fr)); gap:12px; padding:20px 20px 12px; }
    .aw-filters label { min-width:0; font-size:11px; font-weight:600; color:var(--aw-muted); }
    .admin-workspace .aw-filters :is(input,select) { display:block; width:100%; min-width:0; margin-top:6px; padding:10px 11px; height:42px; border:1px solid var(--aw-line); border-radius:8px; font:inherit; font-size:13px; background:var(--aw-field); color:var(--aw-text); }
    .admin-workspace input::placeholder { color:var(--aw-muted); opacity:1; }
    .aw-filter-bottom { display:flex; align-items:center; gap:18px; flex-wrap:wrap; padding:4px 20px 18px; }
    .aw-filter-bottom>span { margin-left:auto; }
    .aw-check { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--aw-text); }
    .aw-check input { accent-color:#4f46e5; width:15px; height:15px; }
    .aw-table-scroll { overflow-x:auto; max-width:100%; }
    .aw-table { width:100%; min-width:1000px; border-collapse:collapse; text-align:left; color:var(--aw-text); }
    .aw-table th { background:var(--aw-field); color:var(--aw-muted); font-size:10px; letter-spacing:.8px; text-transform:uppercase; font-weight:700; padding:14px 18px; border-block:1px solid var(--aw-line); }
    .aw-table td { padding:17px 18px; border-bottom:1px solid var(--aw-line); font-size:12px; vertical-align:middle; }
    .aw-table tbody tr:hover { background:var(--aw-field); }
    .aw-table td:first-child { min-width:220px; max-width:320px; }
    .aw-task-title { display:block; font-size:13px; line-height:1.6; color:var(--aw-text); overflow-wrap:anywhere; }
    .aw-task-description { font-size:12px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
    .aw-assignee { display:flex; align-items:center; gap:8px; }
    .aw-avatar { display:grid; place-items:center; width:28px; height:28px; flex-shrink:0; border-radius:50%; background:var(--aw-soft); color:var(--aw-accent); font-size:11px; font-weight:700; }
    .admin-workspace .aw-table-select { font:inherit; font-size:12px; padding:7px; border:1px solid var(--aw-line); border-radius:7px; background:var(--aw-field); color:var(--aw-text); min-height:35px; max-width:145px; cursor:pointer; }
    .admin-workspace .aw-status-completed { color:#047857; background:#ecfdf5; border-color:#a7f3d0; }
    .admin-workspace .aw-status-in-progress { color:#4338ca; background:#eef2ff; border-color:#c7d2fe; }
    .admin-workspace .aw-status-pending { color:#92400e; background:#fffbeb; border-color:#fde68a; }
    .admin-workspace[data-theme="dark"] .aw-status-completed { color:#6ee7b7; background:#123b32; border-color:#286552; }
    .admin-workspace[data-theme="dark"] .aw-status-in-progress { color:#c7d2fe; background:#282e55; border-color:#4c5686; }
    .admin-workspace[data-theme="dark"] .aw-status-pending { color:#fcd34d; background:#40351d; border-color:#746032; }
    .admin-workspace .aw-table-select option { background:var(--aw-card); color:var(--aw-text); }
    .aw-overdue { display:block; font-size:11px; font-weight:600; margin-top:3px; }
    .admin-workspace .aw-history { min-height:34px; padding:6px 11px; font-size:12px; }
    .aw-pagination { padding:16px 20px; }
    .aw-pagination .aw-button { min-height:34px; padding:6px 12px; font-size:12px; }
    .aw-empty { padding:40px 20px; text-align:center; }
    .aw-empty p { margin:8px 0 18px; }
    .aw-error { display:flex; align-items:center; gap:16px; justify-content:space-between; padding:16px; border:1px solid var(--aw-danger); color:var(--aw-danger); background:var(--aw-card); border-radius:12px; }
    @media(max-width:1200px) { .aw-projects { grid-template-columns:repeat(2,minmax(0,1fr)); } .aw-overview { grid-template-columns:1fr; } .aw-filters { grid-template-columns:repeat(4,minmax(0,1fr)); } .aw-search { grid-column:1 / -1; } }
    @media(max-width:700px) { .admin-workspace { padding:16px; gap:24px; border-radius:14px; } .admin-workspace h1 { font-size:25px; } .aw-stats { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; } .aw-stat { padding:16px; } .aw-stat strong { font-size:27px; } .aw-projects { grid-template-columns:1fr; } .aw-filters { grid-template-columns:repeat(2,minmax(0,1fr)); padding:16px; } .aw-completion { padding:20px; flex-wrap:wrap; } .aw-breakdown { padding:18px; } .aw-completion>.aw-ring { margin:auto; } .aw-header>.aw-actions { width:100%; } .aw-header .aw-button { flex:1; } .aw-filter-bottom { gap:12px; padding:0 16px 16px; } .aw-filter-bottom>span { width:100%; margin:0; } }
    @media(prefers-reduced-motion:reduce) { .aw-ring-value { transition:none; } }
  `}</style>;
}

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
  const [loadError, setLoadError] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [selectedProject, setSelectedProject] = useState("");
  const [page, setPage] = useState(1);
  const [updatingIds, setUpdatingIds] = useState<number[]>([]);
  const [activeAdminSection, setActiveAdminSection] = useState<"workspace" | "members">("workspace");
  const requestId = useRef(0);
  const updateLocks = useRef(new Set<number>());
  const taskSection = useRef<HTMLElement>(null);
  // Keep the complete task response separate from the filtered table.
  // Progress never changes just because the administrator changes a filter.
  const fetchData = useCallback(async () => {
    const request = ++requestId.current;
    try {
      setLoading(true);
      setLoadError("");
      const [pRes, tRes, mRes] = await Promise.all([
        API.get("/projects"), API.get("/tasks"), API.get("/users/members"),
      ]);
      if (request !== requestId.current) return;
      setProjects(pRes.data.data.projects || []);
      setTasks(tRes.data.data.tasks || []);
      setMembers(mRes.data.data.members || []);
      setHasLoaded(true);
    } catch {
      if (request === requestId.current) setLoadError("Could not refresh the dashboard. Please try again.");
    } finally {
      if (request === requestId.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void fetchData(); return () => { requestId.current++; }; }, [fetchData]);
  const beginUpdate = (id: number) => {
    if (updateLocks.current.has(id)) return false;
    updateLocks.current.add(id);
    setUpdatingIds(Array.from(updateLocks.current));
    return true;
  };
  const endUpdate = (id: number) => {
    updateLocks.current.delete(id);
    setUpdatingIds(Array.from(updateLocks.current));
  };
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectForm.title.trim() || !projectForm.description.trim()) { toast.error("All fields are required."); return; }
    try {
      setSubmitting(true);
      const { data } = await API.post("/projects", projectForm);
      if (!data.success) throw new Error(data.message || "The update was not saved.");
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
      if (!data.success) throw new Error(data.message || "The update was not saved.");
      if (data.success) { toast.success("Task created & assigned!"); setShowTaskModal(false); setTaskForm({ title: "", description: "", dueDate: "", projectId: "", assignedTo: "", priority: "Medium" }); fetchData(); }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create task.");
    } finally { setSubmitting(false); }
  };
  const handlePriorityUpdate = async (taskId: number, newPriority: string) => {
    if (!beginUpdate(taskId)) return;
    try {
      const { data } = await API.put(`/tasks/${taskId}/priority`, { priority: newPriority });
      if (!data.success) throw new Error(data.message || "The update was not saved.");
      if (data.success) {
        toast.success(`Priority updated to "${newPriority}"`);
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, priority: newPriority } : t)));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update priority.");
    } finally { endUpdate(taskId); }
  };
  const handleStatusUpdate = async (taskId: number, newStatus: string) => {
    if (newStatus === "Completed") {
      const task = tasks.find((t) => t.id === taskId);
      if (task) setCompletingTask(task);
      return;
    }
    if (!beginUpdate(taskId)) return;
    try {
      const { data } = await API.put(`/tasks/${taskId}/status`, { status: newStatus });
      if (!data.success) throw new Error(data.message || "The update was not saved.");
      if (data.success) {
        toast.success(`Status updated to "${newStatus}"`);
        setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: newStatus, progress: newStatus === "Pending" || t.status === "Completed" ? 0 : t.progress } : t)));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to update status.");
    } finally { endUpdate(taskId); }
  };
  const handleCompleteConfirm = async ({ completedBy, completedAt }: { completedBy: string; completedAt: string }) => {
    if (!completingTask || !beginUpdate(completingTask.id)) return;
    try {
      setCompletingSubmitting(true);
      const { data } = await API.put(`/tasks/${completingTask.id}/status`, {
        status: "Completed",
        completedBy,
        completedAt,
      });
      if (!data.success) throw new Error(data.message || "The update was not saved.");
      if (data.success) {
        toast.success(`Task "${completingTask.title}" marked as completed!`);
        setTasks((prev) => prev.map((t) => t.id === completingTask.id ? { ...t, status: "Completed", progress: 100, completedBy, completedAt } : t));
        setCompletingTask(null);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to complete task.");
    } finally {
      setCompletingSubmitting(false);
      endUpdate(completingTask.id);
    }
  };
  const handleProgressUpdate = async (taskId: number, progress: number) => {
    if (!beginUpdate(taskId)) return false;
    try {
      const { data } = await API.put(`/tasks/${taskId}/progress`, { progress });
      if (!data.success) throw new Error(data.message || "The update was not saved.");
      setTasks((previous) => previous.map((task) => task.id === taskId ? { ...task, progress: data.data.task.progress, status: data.data.task.status } : task));
      toast.success("Task progress saved.");
      return true;
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } }; message?: string };
      toast.error(error.response?.data?.message || error.message || "Could not update task progress.");
      return false;
    } finally {
      endUpdate(taskId);
    }
  };
  const completedCount = tasks.filter(t => t.status === "Completed").length;
  const activeCount = tasks.filter(t => t.status === "In-Progress").length;
  const pendingCount = tasks.filter(t => t.status === "Pending").length;
  const overdueCount = tasks.filter(isOverdue).length;
  const otherCount = tasks.length - completedCount - activeCount - pendingCount;
  const projectTaskIds = useMemo(() => new Map(projects.map(project => [String(project.id), new Set((project.tasks || []).map(task => task.id))])), [projects]);
  const belongsToProject = (task: Task, id: string) => String(task.project?.id ?? task.projectId ?? "") === id || !!projectTaskIds.get(id)?.has(task.id);
  const filteredTasks = useMemo(() => {
    const query = filters.search.trim().toLowerCase();
    const result = tasks.filter(task =>
      (!query || [task.title, task.description, task.assignee?.name, task.project?.title, String(task.id)].some(value => value?.toLowerCase().includes(query))) &&
      (!filters.statuses.length || filters.statuses.includes(task.status)) &&
      (!filters.priorities.length || filters.priorities.includes(task.priority)) &&
      (!filters.overdue || isOverdue(task)) &&
      (!selectedProject || String(task.project?.id ?? task.projectId ?? "") === selectedProject || projectTaskIds.get(selectedProject)?.has(task.id))
    );
    const priorities: Record<string, number> = { Low: 1, Medium: 2, High: 3, Urgent: 4 };
    const direction = filters.sortOrder === "ASC" ? 1 : -1;
    return result.sort((a, b) => {
      let comparison = 0;
      if (filters.sortBy === "title") comparison = a.title.localeCompare(b.title);
      else if (filters.sortBy === "priority") comparison = (priorities[a.priority] || 0) - (priorities[b.priority] || 0);
      else if (filters.sortBy === "dueDate") comparison = a.dueDate.localeCompare(b.dueDate);
      else comparison = (Date.parse(a.createdAt || a.created_at || "") || a.id) - (Date.parse(b.createdAt || b.created_at || "") || b.id);
      return direction * comparison;
    });
  }, [tasks, filters, selectedProject, projectTaskIds]);
  useEffect(() => { setPage(1); }, [filters, selectedProject]);
  const pageCount = Math.max(1, Math.ceil(filteredTasks.length / 10));
  const currentPage = Math.min(page, pageCount);
  const visibleTasks = filteredTasks.slice((currentPage - 1) * 10, currentPage * 10);
  const clearFilters = () => { setFilters({ ...DEFAULT_FILTERS }); setSelectedProject(""); setPage(1); };
  const showProjectTasks = (id: number) => {
    setFilters({ ...DEFAULT_FILTERS }); setSelectedProject(String(id));
    taskSection.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const filterStatus = (status: string) => { setFilters({ ...DEFAULT_FILTERS, statuses: [status] }); setSelectedProject(""); taskSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const exportTasks = () => {
    const cell = (value: unknown) => {
      let text = String(value ?? "");
      if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = [["ID", "Task", "Project", "Assignee", "Priority", "Status", "Due date"], ...filteredTasks.map(t => [t.id, t.title, t.project?.title || projects.find(p => belongsToProject(t, String(p.id)))?.title || "", t.assignee?.name || "", t.priority, t.status, t.dueDate])];
    const blob = new Blob(["\uFEFF" + rows.map(row => row.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "admin-tasks.csv"; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (loading && !hasLoaded && !loadError) return <SkeletonLoader count={6} />;
  return (
    <div className="admin-workspace" data-theme={isDark ? "dark" : "light"}>
      <DashboardStyles />
      <header className="aw-header">
        <div><p className="aw-eyebrow">WORKSPACE / ADMINISTRATION</p><h1>{activeAdminSection === "workspace" ? "Project overview" : "Team Member Overview"}</h1><p className="aw-muted">Welcome{user?.name ? `, ${user.name}` : ""}. Keep your team aligned and work moving.</p></div>
        {activeAdminSection === "workspace" && <div className="aw-actions"><button className="aw-button" onClick={() => setShowProjectModal(true)}>+ New project</button><button className="aw-button aw-primary" onClick={() => setShowTaskModal(true)}>+ New task</button></div>}
      </header>
      <nav aria-label="Admin sections" className="flex flex-wrap gap-2 border-b t-border-subtle pb-4">
        {([{ id: "workspace", label: "Workspace" }, { id: "members", label: "Team Member Overview" }] as const).map((item) => (
          <button key={item.id} type="button" aria-current={activeAdminSection === item.id ? "page" : undefined}
            onClick={() => setActiveAdminSection(item.id)}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${activeAdminSection === item.id ? "border-indigo-600 bg-indigo-600 text-white" : "t-border-subtle t-text-muted hover:bg-slate-500/5"}`}>
            {item.label}
          </button>
        ))}
      </nav>
      {activeAdminSection === "members" ? <TeamMemberOverview /> : <>
      {loadError && <div className="aw-error" role="alert">{loadError} {hasLoaded && "Showing the last loaded data."}<button className="aw-button" onClick={() => void fetchData()} disabled={loading}>Retry</button></div>}
      <div className="aw-stats">
        {[{ label: "Total projects", value: projects.length, hint: "Across your workspace" }, { label: "Total tasks", value: tasks.length, hint: `${completedCount} completed` }, { label: "Team members", value: members.length, hint: "Available for assignment" }, { label: "Overdue tasks", value: overdueCount, hint: "Past due and still open" }].map(stat => <div className="aw-card aw-stat" key={stat.label}><p className="aw-muted">{stat.label}</p><strong className={stat.label === "Overdue tasks" && overdueCount ? "aw-danger" : ""}>{hasLoaded ? stat.value : "—"}</strong><span className="aw-muted">{stat.hint}</span></div>)}
      </div>
      <section className="aw-overview">
        <div className="aw-card aw-completion"><div><p className="aw-eyebrow">WORKSPACE HEALTH</p><h2>Overall progress</h2><p className="aw-muted">{hasLoaded ? `${completedCount} of ${tasks.length} tasks completed` : "Waiting for task data"}</p><p className="aw-small aw-muted">Completion = completed tasks ÷ total tasks.<br />Search and filters do not affect this number.</p></div><ProgressCircle completed={completedCount} total={tasks.length} label="Overall task completion" size={148} /></div>
        <div className="aw-card aw-breakdown"><div className="aw-section-heading"><h2>Task breakdown</h2><span className="aw-muted aw-small">Click a status to filter</span></div>{[{ label: "Completed", count: completedCount, tone: "complete" }, { label: "In-Progress", count: activeCount, tone: "active" }, { label: "Pending", count: pendingCount, tone: "pending" }].map(item => <button className="aw-status-row" key={item.label} onClick={() => filterStatus(item.label)}><span className={`aw-dot aw-${item.tone}`} /><span>{item.label === "In-Progress" ? "In progress" : item.label}</span><div className="aw-track"><span className={`aw-${item.tone}`} style={{ width: `${tasks.length ? item.count / tasks.length * 100 : 0}%` }} /></div><strong>{item.count}</strong></button>)}{otherCount > 0 && <p className="aw-small aw-muted">Other statuses: {otherCount}</p>}</div>
      </section>
      <section>
        <div className="aw-section-heading"><div><h2>Projects</h2><p className="aw-muted aw-small">Progress, ownership, and outstanding work at a glance.</p></div><span className="aw-pill">{projects.length} projects</span></div>
        {!projects.length ? <div className="aw-card aw-empty"><h3>{hasLoaded ? "Start your first project" : "Projects unavailable"}</h3><p className="aw-muted">{hasLoaded ? "Create a project, then add tasks and assign your team." : "Retry loading your workspace above."}</p>{hasLoaded && <button className="aw-button" onClick={() => setShowProjectModal(true)}>+ New project</button>}</div> : <div className="aw-projects">{projects.map(project => {
          const projectTasks = tasks.filter(task => belongsToProject(task, String(project.id)));
          const completed = projectTasks.filter(task => task.status === "Completed").length;
          const overdue = projectTasks.filter(isOverdue).length;
          return <article className="aw-card aw-project" key={project.id}><div className="aw-project-top"><span className="aw-project-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" /></svg></span><span className={`aw-pill ${overdue ? "aw-danger" : ""}`}>{overdue ? `${overdue} overdue` : projectTasks.length && completed === projectTasks.length ? "Completed" : projectTasks.length ? "Active" : "No tasks"}</span></div><h3>{project.title}</h3><p className="aw-project-description aw-muted">{project.description || "No description added."}</p><div className="aw-project-progress"><ProgressCircle completed={completed} total={projectTasks.length} label={`${project.title} completion`} size={80} /><div><strong>{completed} / {projectTasks.length} completed</strong><p className="aw-small aw-muted">{projectTasks.length - completed} tasks remaining</p></div></div><footer><span className="aw-small aw-muted">By {project.creator?.name || "System"}</span><button className="aw-link" onClick={() => showProjectTasks(project.id)}>View tasks →</button></footer></article>;
        })}</div>}
      </section>
      <section ref={taskSection} className="aw-task-section">
        <div className="aw-section-heading"><div><h2>Task management</h2><p className="aw-muted aw-small">Assign priorities, update status, and review task history.</p></div><div className="aw-actions"><button className="aw-button" disabled={loading || updatingIds.length > 0 || submitting || completingSubmitting} onClick={() => void fetchData()}>{loading ? "Refreshing…" : "Refresh"}</button><button className="aw-button" disabled={!filteredTasks.length} onClick={exportTasks}>Export CSV</button></div></div>
        <div className="aw-card aw-task-card">
          <div className="aw-filters">
            <label className="aw-search">Search tasks<input type="search" placeholder="Title, ID, project, or member…" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))} /></label>
            <label>Status<select value={filters.statuses[0] || ""} onChange={e => setFilters(f => ({ ...f, statuses: e.target.value ? [e.target.value] : [] }))}><option value="">All statuses</option>{["Pending", "In-Progress", "Completed"].map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Priority<select value={filters.priorities[0] || ""} onChange={e => setFilters(f => ({ ...f, priorities: e.target.value ? [e.target.value] : [] }))}><option value="">All priorities</option>{["Low", "Medium", "High", "Urgent"].map(value => <option key={value}>{value}</option>)}</select></label>
            <label>Project<select value={selectedProject} onChange={e => setSelectedProject(e.target.value)}><option value="">All projects</option>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select></label>
            <label>Sort by<select value={filters.sortBy} onChange={e => setFilters(f => ({ ...f, sortBy: e.target.value as FilterState["sortBy"] }))}><option value="createdAt">Created date</option><option value="dueDate">Due date</option><option value="priority">Priority</option><option value="title">Title</option></select></label>
          </div>
          <div className="aw-filter-bottom"><label className="aw-check"><input type="checkbox" checked={filters.overdue} onChange={e => setFilters(f => ({ ...f, overdue: e.target.checked }))} />Overdue only</label><button className="aw-link" onClick={() => setFilters(f => ({ ...f, sortOrder: f.sortOrder === "ASC" ? "DESC" : "ASC" }))}>{filters.sortOrder === "ASC" ? "↑ Ascending" : "↓ Descending"}</button><button className="aw-link" onClick={clearFilters}>Reset filters</button><span className="aw-muted aw-small" aria-live="polite">{filteredTasks.length} of {tasks.length} tasks</span></div>
          {!visibleTasks.length ? <div className="aw-empty"><h3>{tasks.length ? "No matching tasks" : hasLoaded ? "No tasks yet" : "Tasks unavailable"}</h3><p className="aw-muted">{tasks.length ? "Try another search or reset your filters." : hasLoaded ? "Create a task to start tracking progress." : "Retry loading the dashboard."}</p>{tasks.length > 0 && <button className="aw-button" onClick={clearFilters}>Reset filters</button>}</div> : <div className="aw-table-scroll" tabIndex={0} role="region" aria-label="Tasks table, scroll horizontally on small screens"><table className="aw-table"><thead><tr>{["Task", "Assignee", "Project", "Priority", "Status", "Progress", "Due date", "History"].map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead><tbody>{visibleTasks.map(task => <tr key={task.id}><td><span className="aw-small aw-muted">#{task.id}</span><button type="button" className="aw-task-title" onClick={() => setTimelineTaskId(task.id)}>{task.title}</button>{task.description && <p className="aw-task-description aw-muted" title={task.description}>{task.description}</p>}</td><td><div className="aw-assignee"><span className="aw-avatar">{task.assignee?.name?.charAt(0) || "?"}</span><span>{task.assignee?.name || "Unassigned"}</span></div></td><td>{task.project?.title || projects.find(project => belongsToProject(task, String(project.id)))?.title || "—"}</td><td><select className="aw-table-select" aria-label={`Priority for ${task.title}`} value={task.priority} disabled={updatingIds.includes(task.id) || loading} onChange={e => void handlePriorityUpdate(task.id, e.target.value)}>{["Low", "Medium", "High", "Urgent"].map(value => <option key={value}>{value}</option>)}</select></td><td><select className={`aw-table-select aw-status-${task.status.toLowerCase()}`} aria-label={`Status for ${task.title}`} value={task.status} disabled={updatingIds.includes(task.id) || loading} onChange={e => void handleStatusUpdate(task.id, e.target.value)}>{["Pending", "In-Progress", "Completed"].map(value => <option key={value}>{value}</option>)}</select></td><td><TaskProgressControl progress={task.status === "Completed" ? 100 : task.progress || 0} status={task.status} disabled={updatingIds.includes(task.id) || loading} onSave={(progress) => handleProgressUpdate(task.id, progress)} size={42} /></td><td><span>{formatDate(task.dueDate)}</span>{isOverdue(task) && <span className="aw-overdue aw-danger">Overdue</span>}</td><td><button className="aw-button aw-history" aria-label={`View history for ${task.title}`} onClick={() => setTimelineTaskId(task.id)}>View</button></td></tr>)}</tbody></table></div>}
          <footer className="aw-pagination"><span className="aw-muted aw-small">{filteredTasks.length ? `${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, filteredTasks.length)} of ${filteredTasks.length}` : "0 tasks"}</span><div className="aw-actions"><button className="aw-button" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span className="aw-small">{currentPage} / {pageCount}</span><button className="aw-button" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div></footer>
        </div>
      </section>
      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {completingTask && <CompleteTaskModal taskId={completingTask.id} taskTitle={completingTask.title} currentUserName={user?.name || ""} onConfirm={handleCompleteConfirm} onCancel={() => { if (!completingSubmitting) setCompletingTask(null); }} submitting={completingSubmitting} />}
      {timelineTaskId && <TaskTimeline taskId={timelineTaskId} onClose={() => setTimelineTaskId(null)} />}
      {showProjectModal && (
        <CreationDialog title="Create new project" subtitle="Give your team's next project a clear starting point." isDark={isDark} busy={submitting} onClose={() => setShowProjectModal(false)}>
          <form onSubmit={handleCreateProject}>
            <fieldset className="creation-fields" disabled={submitting}>
              <p className="creation-note">All fields are required.</p>
              <div><label className="creation-label" htmlFor="project-title">Project name</label><input id="project-title" autoFocus required className="creation-input" value={projectForm.title} onChange={(e) => setProjectForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Company website redesign" /></div>
              <div><label className="creation-label" htmlFor="project-description">Description</label><textarea id="project-description" required className="creation-input" value={projectForm.description} onChange={(e) => setProjectForm(p => ({ ...p, description: e.target.value }))} placeholder="Outline the goals, scope, and expected outcome…" /></div>
            </fieldset>
            <div className="creation-footer">
              <button type="button" disabled={submitting} onClick={() => setShowProjectModal(false)} className="creation-button">Cancel</button>
              <button type="submit" disabled={submitting} className="creation-button creation-button-primary">{submitting ? "Creating…" : "Create project"}</button>
            </div>
          </form>
        </CreationDialog>
      )}
      {showTaskModal && (
        <CreationDialog title="Create new task" subtitle="Define the work, assign an owner, and set a deadline." isDark={isDark} busy={submitting} onClose={() => setShowTaskModal(false)}>
          <form onSubmit={handleCreateTask}>
            <fieldset className="creation-fields" disabled={submitting}>
              <p className="creation-note">All fields are required unless marked optional.</p>
              <div><label className="creation-label" htmlFor="task-title">Task title</label><input id="task-title" autoFocus required className="creation-input" value={taskForm.title} onChange={(e) => setTaskForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Design the homepage layout" /></div>
              <div><label className="creation-label" htmlFor="task-description">Description <span>(optional)</span></label><textarea id="task-description" className="creation-input" value={taskForm.description} onChange={(e) => setTaskForm(p => ({ ...p, description: e.target.value }))} placeholder="Add context, requirements, or acceptance criteria…" /></div>
              <div className="creation-grid">
                <div><label className="creation-label" htmlFor="task-project">Project</label><select id="task-project" required className="creation-input" value={taskForm.projectId} onChange={(e) => setTaskForm(p => ({ ...p, projectId: e.target.value }))}><option value="">Select a project</option>{projects.map(pr => <option key={pr.id} value={pr.id}>{pr.title}</option>)}</select>{projects.length === 0 && <p className="creation-note">Create a project before adding a task.</p>}</div>
                <div><label className="creation-label" htmlFor="task-assignee">Assign member</label><select id="task-assignee" required className="creation-input" value={taskForm.assignedTo} onChange={(e) => setTaskForm(p => ({ ...p, assignedTo: e.target.value }))}><option value="">Select a member</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}{requestedMemberNames.filter(name => !members.some(member => member.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())).map(name => <option key={`unregistered-${name}`} value="" disabled>{name} — not registered</option>)}</select><p className="creation-note">{members.length ? "Only registered members can be assigned. Names marked “not registered” are display-only." : "No registered members are available to assign yet. The listed names are display-only until accounts are created."}</p></div>
              </div>
              <div><label className="creation-label" htmlFor="task-due-date">Due date</label><input id="task-due-date" required type="date" className="creation-input" value={taskForm.dueDate} onChange={(e) => setTaskForm(p => ({ ...p, dueDate: e.target.value }))} /></div>
              <div role="group" aria-labelledby="task-priority-label"><span className="creation-label" id="task-priority-label">Priority</span><div className="creation-priorities">{["Low", "Medium", "High", "Urgent"].map(p => <button key={p} type="button" aria-pressed={taskForm.priority === p} onClick={() => setTaskForm(prev => ({ ...prev, priority: p }))} className="creation-priority">{p}</button>)}</div></div>
            </fieldset>
            <div className="creation-footer">
              <button type="button" disabled={submitting} onClick={() => setShowTaskModal(false)} className="creation-button">Cancel</button>
              <button type="submit" disabled={submitting || projects.length === 0 || members.length === 0} className="creation-button creation-button-primary">{submitting ? "Creating…" : "Create task"}</button>
            </div>
          </form>
        </CreationDialog>
      )}
      </>}
    </div>
  );
}
