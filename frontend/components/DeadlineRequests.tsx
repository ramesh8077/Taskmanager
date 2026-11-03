"use client";

import { useCallback, useEffect, useState } from "react";
import API from "@/lib/axios";

interface DeadlineRequest {
  id: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  currentDeadline: string;
  requestedDeadline: string;
  reason: string;
  responseNote?: string | null;
  createdAt: string;
  task?: { id: number; title: string; dueDate: string; assignedTo: number };
  requester?: { id: number; name: string; employeeId: string; position: string };
}

interface ApiResponse {
  success: boolean;
  data: { requests: DeadlineRequest[] };
  message?: string;
}

function errorMessage(error: unknown) {
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
  return "Could not load or review deadline requests.";
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export default function DeadlineRequests() {
  const [requests, setRequests] = useState<DeadlineRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [error, setError] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await API.get<ApiResponse>("/tasks/deadline-requests", {
        params: { status: "PENDING" },
      });
      setRequests(data.data.requests || []);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRequests();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadRequests]);

  async function review(request: DeadlineRequest, decision: "APPROVED" | "REJECTED") {
    setSubmittingId(request.id);
    setError("");
    try {
      await API.put(`/tasks/deadline-requests/${request.id}`, {
        decision,
        ...(responseNote.trim() ? { responseNote: responseNote.trim() } : {}),
      });
      setResponseNote("");
      await loadRequests();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <section className="deadline-requests" aria-labelledby="deadline-requests-title">
      <header className="deadline-requests-header">
        <div>
          <h1 id="deadline-requests-title" className="dashboard-page-title">Deadline requests</h1>
          <p className="dashboard-page-subtitle">Review requests from assigned team members.</p>
        </div>
        <button type="button" className="work-item-create-button" onClick={() => void loadRequests()} disabled={loading}>
          Refresh
        </button>
      </header>
      {error && <p className="work-item-dialog-error" role="alert">{error}</p>}
      {loading ? (
        <p className="deadline-requests-empty" role="status">Loading deadline requests…</p>
      ) : requests.length === 0 ? (
        <p className="deadline-requests-empty">There are no pending deadline requests in your scope.</p>
      ) : (
        <div className="deadline-requests-list">
          {requests.map((request) => (
            <article key={request.id} className="deadline-request-card">
              <div className="deadline-request-title">
                <div>
                  <h2>{request.task?.title || `Task #${request.task?.id ?? "—"}`}</h2>
                  <p>
                    Requested by {request.requester?.name || "Team member"}
                    {request.requester?.position ? ` · ${request.requester.position.toLowerCase().replaceAll("_", " ")}` : ""}
                  </p>
                </div>
                <span>Task #{request.task?.id ?? "—"}</span>
              </div>
              <dl className="deadline-request-dates">
                <div><dt>Current deadline</dt><dd>{dateLabel(request.currentDeadline)}</dd></div>
                <div><dt>Requested deadline</dt><dd>{dateLabel(request.requestedDeadline)}</dd></div>
                <div><dt>Requested on</dt><dd>{new Date(request.createdAt).toLocaleString()}</dd></div>
              </dl>
              <p className="deadline-request-reason"><strong>Reason</strong>{request.reason}</p>
              <label className="deadline-request-note">
                Response note (optional)
                <textarea value={responseNote} maxLength={2000} rows={2} onChange={(event) => setResponseNote(event.target.value)} />
              </label>
              <div className="work-item-dialog-actions">
                <button type="button" className="work-item-dialog-cancel" disabled={submittingId !== null} onClick={() => void review(request, "REJECTED")}>
                  {submittingId === request.id ? "Saving…" : "Reject"}
                </button>
                <button type="button" className="work-item-create-button is-primary" disabled={submittingId !== null} onClick={() => void review(request, "APPROVED")}>
                  {submittingId === request.id ? "Saving…" : "Approve extension"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
