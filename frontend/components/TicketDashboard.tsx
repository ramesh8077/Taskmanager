"use client";

import { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import SkeletonLoader from "@/components/SkeletonLoader";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";

interface HistoryEntry {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  action: string;
  createdAt: string;
  changedByUser?: { id: number; name: string };
}

interface Comment {
  id: number;
  comment: string;
  createdAt: string;
  user: { id: number; name: string };
}

interface Ticket {
  id: number;
  title: string;
  description?: string;
  screenshotUrl?: string;
  priority: string;
  status: string;
  department: string;
  rootCause?: string;
  createdAt: string;
  creator?: { id: number; name: string; email: string };
  assignee?: { id: number; name: string; email: string };
  comments?: Comment[];
  history?: HistoryEntry[];
}

const priorityStyle: Record<string, string> = {
  P0: "bg-red-500/10 text-red-500 border-red-500/20",
  P1: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  P2: "bg-blue-500/10 text-blue-500 border-blue-500/20",
};

const statusBadge: Record<string, string> = {
  Open: "bg-green-500 text-white",
  "In-Progress": "bg-blue-500 text-white",
  Resolved: "bg-emerald-500 text-white",
  Closed: "bg-gray-500 text-white",
};

export default function TicketDashboard() {
  const { isDark } = useTheme();
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [members, setMembers] = useState<{ id: number; name: string; email: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState<Ticket | null>(null);
  const [viewTicket, setViewTicket] = useState<Ticket | null>(null);
  const [detailTab, setDetailTab] = useState<"details" | "activity" | "comments">("details");
  
  // Forms
  // ... (keeping existing forms state)
  const [createForm, setCreateForm] = useState({
    title: "",
    description: "",
    screenshotUrl: "",
    priority: "P2",
    department: "",
    assignedTo: "",
  });
  
  const [resolveForm, setResolveForm] = useState({
    rootCause: "",
    department: "",
    assignedTo: "",
  });

  const [commentText, setCommentText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchTerm) params.append("search", searchTerm);
      if (statusFilter) params.append("status", statusFilter);
      if (priorityFilter) params.append("priority", priorityFilter);
      
      const { data } = await API.get(`/tickets?${params.toString()}`);
      setTickets(data.data.tickets || []);
    } catch {
      toast.error("Failed to fetch tickets.");
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, priorityFilter]);

  const fetchMembers = async () => {
    try {
      const { data } = await API.get("/users/members");
      setMembers(data.data.members || []);
    } catch {}
  };

  useEffect(() => {
    fetchTickets();
    fetchMembers();
  }, [fetchTickets]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title || !createForm.department) {
      toast.error("Title and Department are required.");
      return;
    }
    try {
      setSubmitting(true);
      const { data } = await API.post("/tickets", {
        ...createForm,
        assignedTo: createForm.assignedTo ? Number(createForm.assignedTo) : null,
      });
      if (data.success) {
        toast.success("Ticket created successfully!");
        setShowCreateModal(false);
        setCreateForm({ title: "", description: "", screenshotUrl: "", priority: "P2", department: "", assignedTo: "" });
        fetchTickets();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResolveTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResolveModal) return;
    if (!resolveForm.rootCause || !resolveForm.department || !resolveForm.assignedTo) {
      toast.error("Root Cause, Department, and Assigned Agent are mandatory.");
      return;
    }
    try {
      setSubmitting(true);
      const { data } = await API.put(`/tickets/${showResolveModal.id}/resolve`, {
        ...resolveForm,
        assignedTo: Number(resolveForm.assignedTo),
      });
      if (data.success) {
        toast.success("Ticket resolved!");
        setShowResolveModal(null);
        setResolveForm({ rootCause: "", department: "", assignedTo: "" });
        fetchTickets();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to resolve ticket.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewTicket || !commentText.trim()) return;
    try {
      const { data } = await API.post(`/tickets/${viewTicket.id}/comments`, { comment: commentText });
      if (data.success) {
        setViewTicket({
          ...viewTicket,
          comments: [...(viewTicket.comments || []), data.data.comment]
        });
        setCommentText("");
        setTickets(prev => prev.map(t => t.id === viewTicket.id ? { ...t, comments: [...(t.comments || []), data.data.comment] } : t));
      }
    } catch {
      toast.error("Failed to add comment.");
    }
  };

  const inputCls = "w-full px-4 py-2 rounded-lg text-sm outline-none transition-all t-text-primary placeholder:t-text-muted";
  const inputStyle = {
    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
    border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
  };

  return (
    <div className="flex h-[calc(100vh-140px)] gap-6 overflow-hidden">
      {/* Sidebar Filters */}
      <aside className="w-64 flex-shrink-0 space-y-6 hidden lg:block overflow-y-auto pr-2">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-widest t-text-muted mb-4">Filter By</h3>
          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold t-text-label block mb-2">Status</label>
              <select className={inputCls} style={inputStyle} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="Open">Open</option>
                <option value="In-Progress">In-Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold t-text-label block mb-2">Priority</label>
              <select className={inputCls} style={inputStyle} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
                <option value="">All Priorities</option>
                <option value="P0">P0 (Critical)</option>
                <option value="P1">P1 (High)</option>
                <option value="P2">P2 (Medium)</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-bold t-text-label block mb-2">Department</label>
              <input className={inputCls} style={inputStyle} placeholder="Search Dept..." />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Table Area */}
      <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 rounded-3xl border shadow-sm overflow-hidden" style={{ borderColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)" }}>
        {/* Toolbar */}
        <div className="p-4 border-b flex items-center justify-between gap-4" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
          <div className="flex items-center gap-4 flex-1">
            <h2 className="font-bold text-xl px-2 t-text-primary">HD Ticket</h2>
            <div className="relative max-w-sm flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40">🔍</span>
              <input
                type="text"
                placeholder="Search ID or Title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none border transition-all t-text-primary"
                style={inputStyle}
              />
            </div>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 rounded-xl bg-brand-600 text-white text-xs font-bold hover:bg-brand-700 transition-colors cursor-pointer"
          >
            + Add HD Ticket
          </button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? <SkeletonLoader count={5} /> : (
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-800/50 t-text-muted text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3 font-bold">ID</th>
                  <th className="px-6 py-3 font-bold">Subject</th>
                  <th className="px-6 py-3 font-bold">Assignee</th>
                  <th className="px-6 py-3 font-bold">Priority</th>
                  <th className="px-6 py-3 font-bold">Dept</th>
                  <th className="px-6 py-3 font-bold">Status</th>
                  <th className="px-6 py-3 font-bold">Created</th>
                  <th className="px-6 py-3 font-bold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
                {tickets.map(t => (
                  <tr
                    key={t.id}
                    onClick={() => { setViewTicket(t); setDetailTab("details"); }}
                    className="group hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 text-xs font-mono t-text-muted">#{t.id}</td>
                    <td className="px-6 py-4 font-semibold text-sm t-text-primary">{t.title}</td>
                    <td className="px-6 py-4 text-xs t-text-secondary">{t.assignee?.name || "—"}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${priorityStyle[t.priority]}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs t-text-secondary">{t.department}</td>
                    <td className="px-6 py-4">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${statusBadge[t.status]}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-[11px] t-text-muted">{new Date(t.createdAt).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-right">
                      {t.status !== "Resolved" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setShowResolveModal(t); }}
                          className="opacity-0 group-hover:opacity-100 px-3 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20 transition-all hover:bg-emerald-500/20"
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loading && tickets.length === 0 && (
            <div className="py-20 text-center t-text-muted italic">No tickets found.</div>
          )}
        </div>

        {/* Footer / Pagination */}
        <div className="p-4 border-t flex items-center gap-4 text-xs font-medium t-text-muted" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
          <span className="mr-auto">Showing {tickets.length} results</span>
          <button className="px-3 py-1 rounded bg-black/5 dark:bg-white/5">20</button>
          <button className="px-3 py-1 rounded bg-black/5 dark:bg-white/5">100</button>
          <button className="px-3 py-1 rounded bg-black/5 dark:bg-white/5">500</button>
        </div>
      </div>

      {/* Ticket Detail View Modal */}
      {viewTicket && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setViewTicket(null)}>
          <div className="w-full max-w-5xl h-[85vh] rounded-3xl bg-white dark:bg-zinc-900 border shadow-2xl flex flex-col overflow-hidden animate-slide-up" style={{ borderColor: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)" }} onClick={e => e.stopPropagation()}>
            {/* Modal Header */}
            <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
              <div className="flex items-center gap-3">
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${statusBadge[viewTicket.status]}`}>{viewTicket.status}</span>
                <h2 className="text-xl font-bold t-text-primary">{viewTicket.title}</h2>
                <span className="text-sm t-text-muted"># {viewTicket.id}</span>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors">🖨️</button>
                <button onClick={() => setViewTicket(null)} className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors ml-2">✕</button>
              </div>
            </div>

            {/* Modal Tabs */}
            <div className="px-6 flex border-b bg-zinc-50/50 dark:bg-zinc-800/30" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
              {[
                { id: "details", label: "Details" },
                { id: "activity", label: "Activity" },
                { id: "comments", label: "Comments" }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id as any)}
                  className={`px-6 py-3 text-xs font-bold transition-all border-b-2 ${
                    detailTab === tab.id ? "border-brand-500 text-brand-500" : "border-transparent t-text-muted hover:t-text-primary"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-8 flex gap-8">
              {detailTab === "details" && (
                <div className="flex-1 space-y-8">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 p-6 rounded-2xl bg-zinc-50 dark:bg-zinc-800/40 border" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
                    <div><p className="text-[10px] t-text-muted uppercase font-bold mb-1">Priority</p><p className="text-sm font-bold t-text-primary">{viewTicket.priority}</p></div>
                    <div><p className="text-[10px] t-text-muted uppercase font-bold mb-1">Department</p><p className="text-sm font-bold t-text-primary">{viewTicket.department}</p></div>
                    <div><p className="text-[10px] t-text-muted uppercase font-bold mb-1">Assign Agent</p><p className="text-sm font-bold t-text-primary">{viewTicket.assignee?.name || "Unassigned"}</p></div>
                    <div><p className="text-[10px] t-text-muted uppercase font-bold mb-1">Created By</p><p className="text-sm font-bold t-text-primary">{viewTicket.creator?.name}</p></div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-sm font-bold t-text-primary">Description</h3>
                    <div className="p-6 rounded-2xl border min-h-[150px] t-text-secondary text-sm leading-relaxed" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
                      {viewTicket.description || "No description provided."}
                    </div>
                  </div>

                  {viewTicket.screenshotUrl && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold t-text-primary">Attachments</h3>
                      <img src={viewTicket.screenshotUrl} className="max-w-md rounded-2xl border shadow-lg" alt="Attachment" />
                    </div>
                  )}

                  {viewTicket.rootCause && (
                    <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
                      <h3 className="text-sm font-bold text-emerald-500">Resolution / Root Cause</h3>
                      <p className="text-sm t-text-secondary">{viewTicket.rootCause}</p>
                    </div>
                  )}
                </div>
              )}

              {detailTab === "activity" && (
                <div className="flex-1 space-y-6">
                  <h3 className="text-sm font-bold t-text-primary mb-6">Activity Log</h3>
                  <div className="space-y-8 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-zinc-200 dark:before:bg-zinc-800">
                    {viewTicket.history?.map(h => (
                      <div key={h.id} className="relative pl-10 flex gap-4">
                        <div className="absolute left-[9px] top-1.5 w-1.5 h-1.5 rounded-full bg-brand-500 ring-4 ring-brand-500/10 shadow-sm" />
                        <div>
                          <p className="text-sm t-text-primary">
                            <span className="font-bold">{h.changedByUser?.name}</span> {h.action === "created" ? "created this ticket" : `changed ${h.field}`}
                            {h.oldValue && h.newValue && (
                              <span className="t-text-muted italic ml-1">
                                from <span className="line-through opacity-60 px-1">{h.oldValue}</span> to <span className="font-semibold text-brand-500">{h.newValue}</span>
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] t-text-muted mt-1">{new Date(h.createdAt).toLocaleString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailTab === "comments" && (
                <div className="flex-1 flex flex-col gap-6">
                  <div className="flex-1 space-y-6">
                    {viewTicket.comments?.map(c => (
                      <div key={c.id} className="flex gap-4 group">
                        <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center font-bold t-text-muted text-xs shadow-inner">
                          {c.user.name.charAt(0)}
                        </div>
                        <div className="flex-1 bg-zinc-50 dark:bg-zinc-800/50 p-5 rounded-3xl rounded-tl-none border border-black/5 dark:border-white/5">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold t-text-primary">{c.user.name}</span>
                            <span className="text-[10px] t-text-muted italic">{new Date(c.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-sm t-text-secondary leading-relaxed">{c.comment}</p>
                        </div>
                      </div>
                    ))}
                    {viewTicket.comments?.length === 0 && <p className="text-center py-10 t-text-muted italic">No comments yet.</p>}
                  </div>
                  <form onSubmit={handleAddComment} className="mt-auto pt-6 border-t" style={{ borderColor: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }}>
                    <div className="relative">
                      <textarea
                        className="w-full pl-4 pr-16 py-3 rounded-2xl text-sm outline-none bg-zinc-100 dark:bg-zinc-800 border-none transition-all resize-none min-h-[100px]"
                        placeholder="Type a reply / comment..."
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                      />
                      <button type="submit" className="absolute right-3 bottom-3 p-2 bg-brand-600 text-white rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all">
                        🚀
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateModal(false)}>
          <div className="w-full max-w-xl bg-white dark:bg-zinc-900 rounded-[2.5rem] p-10 border shadow-2xl animate-scale-up" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-black t-text-primary mb-8 tracking-tight">Create New Helpdesk Ticket</h2>
            <form onSubmit={handleCreateTicket} className="space-y-5">
              <div>
                <label className="text-xs font-bold t-text-label uppercase ml-1 mb-2 block">Subject *</label>
                <input className={inputCls} style={inputStyle} value={createForm.title} onChange={e => setCreateForm(p => ({ ...p, title: e.target.value }))} placeholder="In the live call popup, it shows..." />
              </div>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="text-xs font-bold t-text-label uppercase ml-1 mb-2 block">Department *</label>
                  <input className={inputCls} style={inputStyle} value={createForm.department} onChange={e => setCreateForm(p => ({ ...p, department: e.target.value }))} placeholder="Tech Team" />
                </div>
                <div>
                  <label className="text-xs font-bold t-text-label uppercase ml-1 mb-2 block">Priority *</label>
                  <select className={inputCls} style={inputStyle} value={createForm.priority} onChange={e => setCreateForm(p => ({ ...p, priority: e.target.value }))}>
                    <option value="P0">P0 (Critical)</option>
                    <option value="P1">P1 (High)</option>
                    <option value="P2">P2 (Medium)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-5">
                <div>
                  <label className="text-xs font-bold t-text-label uppercase ml-1 mb-2 block">Assign Agent</label>
                  <select className={inputCls} style={inputStyle} value={createForm.assignedTo} onChange={e => setCreateForm(p => ({ ...p, assignedTo: e.target.value }))}>
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold t-text-label uppercase ml-1 mb-2 block">Description</label>
                <textarea className={`${inputCls} min-h-[120px]`} style={inputStyle} value={createForm.description} onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))} placeholder="Detailed issue info..." />
              </div>
              <div className="flex justify-end gap-4 pt-6">
                <button type="button" onClick={() => setShowCreateModal(false)} className="px-6 py-3 text-sm font-bold t-text-muted hover:t-text-primary transition-all">Cancel</button>
                <button type="submit" disabled={submitting} className="px-8 py-3 rounded-2xl bg-zinc-900 dark:bg-white text-white dark:text-black font-black text-sm shadow-xl disabled:opacity-50 transition-transform active:scale-95">
                  {submitting ? "Processing..." : "Submit Ticket"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve Ticket Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowResolveModal(null)}>
          <div className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-[2.5rem] p-10 border shadow-2xl" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-black t-text-primary mb-2 tracking-tight">Resolve Ticket #{showResolveModal.id}</h2>
            <p className="text-xs t-text-muted mb-8">Resolution details are required to close this ticket.</p>
            <form onSubmit={handleResolveTicket} className="space-y-6">
              <div>
                <label className="text-xs font-bold t-text-label uppercase ml-1 mb-2 block">Root Cause Analysis *</label>
                <textarea className={`${inputCls} min-h-[120px]`} style={inputStyle} value={resolveForm.rootCause} onChange={e => setResolveForm(p => ({ ...p, rootCause: e.target.value }))} placeholder="Explain why this happened and how it was fixed..." />
              </div>
              <div>
                <label className="text-xs font-bold t-text-label uppercase ml-1 mb-2 block">Confirm Department *</label>
                <input className={inputCls} style={inputStyle} value={resolveForm.department} onChange={e => setResolveForm(p => ({ ...p, department: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-bold t-text-label uppercase ml-1 mb-2 block">Re-assign Agent (Optional) *</label>
                <select className={inputCls} style={inputStyle} value={resolveForm.assignedTo} onChange={e => setResolveForm(p => ({ ...p, assignedTo: e.target.value }))}>
                  <option value="">Select Agent</option>
                  {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-4 pt-4">
                <button type="button" onClick={() => setShowResolveModal(null)} className="px-6 py-3 text-sm font-bold t-text-muted hover:t-text-primary">Cancel</button>
                <button type="submit" disabled={submitting} className="px-8 py-3 rounded-2xl bg-emerald-600 text-white font-black text-sm shadow-xl shadow-emerald-500/20 disabled:opacity-50 transition-transform active:scale-95">
                  {submitting ? "Saving..." : "Confirm Resolution"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
