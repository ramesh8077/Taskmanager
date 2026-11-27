"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import { formatMinutesMarkdown, splitParagraphs, type MeetingMinutes } from "@/lib/momFormat";
import styles from "./Meetings.module.css";

interface Person {
  id: number;
  name: string;
  department: string;
  position: string;
}

interface Participant {
  id: number;
  userId: number;
  participantRole: "HOST" | "PARTICIPANT";
  user: Person;
}

interface Meeting {
  id: number;
  title: string;
  agenda: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  hostId: number;
  host: Person;
  participants: Participant[];
  startedAt: string | null;
  endedAt: string | null;
  hasMinutes: boolean;
  attendance: Array<{
    id: number;
    userId: number;
    joinedAt: string;
    leftAt: string | null;
    user: { id: number; name: string; position: string };
  }>;
  minutes?: MeetingMinutes | null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function actualDuration(meeting: Meeting) {
  if (meeting.status !== "ENDED" || !meeting.startedAt || !meeting.endedAt) return null;
  const minutes = Math.max(0, Math.round((new Date(meeting.endedAt).getTime() - new Date(meeting.startedAt).getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return hours ? `${hours} hr ${remainder} min` : `${remainder} min`;
}

function isPastMeeting(meeting: Meeting, now: number) {
  if (meeting.status === "ENDED" || meeting.status === "CANCELLED") return true;
  const plannedEnd = new Date(meeting.scheduledAt).getTime() + meeting.durationMinutes * 60000;
  return Number.isFinite(plannedEnd) && plannedEnd <= now;
}

function meetingDisplayStatus(meeting: Meeting, now: number) {
  if (isPastMeeting(meeting, now) && meeting.status === "SCHEDULED") return "MISSED";
  if (isPastMeeting(meeting, now) && meeting.status === "LIVE") return "OVERDUE";
  return meeting.status;
}

function meetingAttendees(meeting: Meeting) {
  const peopleById = new Map<number, string>();
  for (const entry of meeting.attendance || []) {
    if (entry.user?.name) peopleById.set(entry.userId, entry.user.name);
  }
  return [...peopleById.values()];
}

function MeetingHistoryRow({ meeting, now, isHost, onOpenMeeting }: {
  meeting: Meeting;
  now: number;
  isHost: boolean;
  onOpenMeeting: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(meeting.minutes || null);
  const [loadingMinutes, setLoadingMinutes] = useState(false);
  const [minutesError, setMinutesError] = useState("");
  const invited = meeting.participants.filter((person) => person.participantRole !== "HOST");
  const attendees = meetingAttendees(meeting);
  const displayStatus = meetingDisplayStatus(meeting, now);

  async function toggleMinutes() {
    if (!meeting.hasMinutes) {
      onOpenMeeting();
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (minutes) return;
    setLoadingMinutes(true);
    setMinutesError("");
    try {
      const response = await API.get(`/meetings/${meeting.id}`);
      setMinutes(response.data?.data?.meeting?.minutes || null);
      if (!response.data?.data?.meeting?.minutes) setMinutesError("MOM data is unavailable for this meeting.");
    } catch (error) {
      setMinutesError(apiMessage(error, "MOM load nahi ho paayi. Please try again."));
    } finally {
      setLoadingMinutes(false);
    }
  }

  async function copyMinutes() {
    if (!minutes) return;
    const text = formatMinutesMarkdown(meeting, minutes);
    try {
      await navigator.clipboard.writeText(text);
      toast.success("MOM copied.");
    } catch {
      toast.error("MOM copy nahi ho paayi.");
    }
  }

  return <>
    <tr>
      <td className={styles.historyMeetingCell}>
        <strong>{meeting.title}</strong>
        {meeting.agenda && <span>{meeting.agenda}</span>}
      </td>
      <td>{meeting.hasMinutes
        ? <div className={styles.momCell}><p className={styles.momSummaryInline}>{minutes?.summary || "AI minutes are ready."}</p><button type="button" className={styles.momTableButton} aria-expanded={expanded} onClick={() => void toggleMinutes()}>{loadingMinutes ? "Loading…" : expanded ? "Hide full MOM" : "View full MOM"}</button></div>
        : meeting.status === "ENDED" && isHost
          ? <button type="button" className={styles.momTableButton} onClick={onOpenMeeting}>Create MOM</button>
          : <span className={styles.minutesPending}>{displayStatus === "OVERDUE" ? "Overdue · MOM after meeting ends" : displayStatus === "MISSED" ? "Not started · no MOM" : meeting.status === "ENDED" ? "MOM not added" : ["SCHEDULED", "LIVE"].includes(meeting.status) ? "Available after meeting" : "MOM unavailable"}</span>}
      </td>
      <td>{formatDate(meeting.scheduledAt)}
        {meeting.endedAt && meeting.status === "ENDED" && <small className={styles.tableSubtext}>Ended {formatDate(meeting.endedAt)}</small>}
      </td>
      <td>{meeting.host?.name || "—"}</td>
      <td><strong>{invited.length}</strong>{invited.length > 0 && <small className={styles.tableSubtext}>{invited.map((person) => person.user?.name).filter(Boolean).join(", ")}</small>}</td>
      <td><strong>{attendees.length}</strong>{attendees.length > 0 && <small className={styles.tableSubtext}>{attendees.join(", ")}</small>}{!attendees.length && <small className={styles.tableSubtext}>No attendance recorded</small>}</td>
      <td>{actualDuration(meeting) || (meeting.status === "CANCELLED" ? "—" : `${meeting.durationMinutes} min planned`)}</td>
      <td><span className={`${styles.status} ${displayStatus === "ENDED" ? styles.ended : displayStatus === "CANCELLED" ? styles.cancelled : displayStatus === "LIVE" ? styles.live : displayStatus === "OVERDUE" ? styles.overdue : displayStatus === "MISSED" ? styles.ended : ""}`}>{displayStatus === "ENDED" ? "Completed" : displayStatus === "CANCELLED" ? "Cancelled" : displayStatus === "OVERDUE" ? "Overdue" : displayStatus === "MISSED" ? "Not started" : displayStatus === "LIVE" ? "Live" : "Upcoming"}</span></td>
      <td><button type="button" className={styles.tableAction} onClick={onOpenMeeting}>Details</button></td>
    </tr>
    {expanded && <tr className={styles.momExpandedRow}><td colSpan={9}>
      {loadingMinutes ? <p>Loading meeting minutes…</p> : minutesError ? <p role="alert">{minutesError}</p> : minutes ? <div className={styles.momTableContent}>
        <div className={styles.momSummaryBlock}>
          <div>
            <strong>Executive Summary</strong>
            {splitParagraphs(minutes.summary).map((paragraph, index) => (
              <p key={`table-summary-${index}`}>{paragraph}</p>
            ))}
          </div>
          <button type="button" className={styles.tableAction} onClick={() => void copyMinutes()}>Copy MOM</button>
        </div>
        {(minutes.detailedDiscussion?.length || 0) > 0 ? (
          <div className={styles.momDetailedBlock}>
            <strong>Detailed Discussion</strong>
            <div className={styles.minutesTopicsList}>
              {minutes.detailedDiscussion!.map((topic, index) => (
                <article key={`${index}-${topic.heading}`} className={styles.minutesTopicCard}>
                  <h5>{index + 1}. {topic.heading}</h5>
                  {splitParagraphs(topic.summary).map((paragraph, pIndex) => (
                    <p key={`table-topic-${index}-p-${pIndex}`}>{paragraph}</p>
                  ))}
                  {topic.keyPoints?.length > 0 && (
                    <ul>{topic.keyPoints.map((point, kIndex) => <li key={`table-topic-${index}-k-${kIndex}`}>{point}</li>)}</ul>
                  )}
                </article>
              ))}
            </div>
          </div>
        ) : minutes.discussionTopics.length > 0 ? (
          <div><strong>Discussion Topics</strong><ul>{minutes.discussionTopics.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>
        ) : null}
        {minutes.decisions.length > 0 && <div><strong>Decisions</strong><ul>{minutes.decisions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
        {minutes.actionItems.length > 0 && <div><strong>Action Items</strong><ul>{minutes.actionItems.map((item, index) => <li key={`${index}-${item.task}`}>{item.task} · {item.owner} · Due {item.dueDate} · {item.priority}</li>)}</ul></div>}
        {minutes.risksAndBlockers.length > 0 && <div><strong>Risks &amp; Blockers</strong><ul>{minutes.risksAndBlockers.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
        {minutes.openQuestions.length > 0 && <div><strong>Open Questions</strong><ul>{minutes.openQuestions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
        {(minutes.keyTakeaways?.length || 0) > 0 && <div><strong>Key Takeaways</strong><ul>{minutes.keyTakeaways!.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>}
        {minutes.nextMeeting && <div><strong>Next Meeting</strong><p>{minutes.nextMeeting}</p></div>}
      </div> : null}
    </td></tr>}
  </>;
}

function apiMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { message?: string } } })?.response;
  return response?.data?.message || fallback;
}

export default function MeetingWorkspace() {
  const router = useRouter();
  const { user } = useAuth();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");
  const [meetingView, setMeetingView] = useState<"all" | "upcoming" | "history">("all");
  const [meetingSearch, setMeetingSearch] = useState("");
  const [localNow, setLocalNow] = useState("");
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 30000);
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setLocalNow(now.toISOString().slice(0, 16));
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "1") setShowForm(true);
    if (params.get("view") === "history") setMeetingView("history");
    return () => window.clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [meetingResponse, peopleResponse] = await Promise.all([
        API.get("/meetings"),
        API.get("/meetings/people"),
      ]);
      setMeetings(meetingResponse.data?.data?.meetings || []);
      setPeople(peopleResponse.data?.data?.people || []);
    } catch (error) {
      toast.error(apiMessage(error, "Meetings load nahi ho paayi."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredPeople = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return people;
    return people.filter((person) =>
      `${person.name} ${person.department} ${person.position}`.toLowerCase().includes(term),
    );
  }, [people, query]);

  const searchTerm = meetingSearch.trim().toLowerCase();
  const searchedMeetings = meetings.filter((meeting) =>
    !searchTerm || `${meeting.title} ${meeting.agenda || ""} ${meeting.host?.name || ""}`.toLowerCase().includes(searchTerm),
  );
  const upcoming = searchedMeetings.filter((meeting) => ["SCHEDULED", "LIVE"].includes(meeting.status) && !isPastMeeting(meeting, now))
    .sort((a, b) => Number(b.status === "LIVE") - Number(a.status === "LIVE") || new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const history = searchedMeetings.filter((meeting) => isPastMeeting(meeting, now))
    .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
  const liveCount = upcoming.filter((meeting) => meeting.status === "LIVE").length;
  const visibleMeetings = meetingView === "all"
    ? [...searchedMeetings].sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
    : meetingView === "upcoming"
      ? upcoming
      : history;

  const closeForm = useCallback(() => {
    if (saving) return;
    setShowForm(false);
    setFormError("");
  }, [saving]);

  function openForm() {
    setFormError("");
    setShowForm(true);
  }

  useEffect(() => {
    if (!showForm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeForm();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showForm, closeForm]);

  async function createMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const localStart = String(form.get("scheduledAt") || "");
    if (!localStart) {
      const message = "Meeting ka date aur time select karein.";
      setFormError(message);
      toast.error(message);
      return;
    }

    setFormError("");
    setSaving(true);
    try {
      await API.post("/meetings", {
        title: form.get("title"),
        agenda: form.get("agenda"),
        scheduledAt: new Date(localStart).toISOString(),
        durationMinutes: Number(form.get("durationMinutes")),
        attendeeIds: selectedPeople,
      });
      toast.success("Meeting schedule ho gayi.");
      setSelectedPeople([]);
      setQuery("");
      setFormError("");
      setShowForm(false);
      formElement.reset();
      await loadData();
    } catch (error) {
      const message = apiMessage(error, "Meeting schedule nahi ho paayi.");
      setFormError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function togglePerson(id: number) {
    setSelectedPeople((current) =>
      current.includes(id) ? current.filter((personId) => personId !== id) : [...current, id],
    );
  }

  return (
    <ProtectedRoute>
      <section className={styles.workspace}>
        <div className={styles.header}>
          <div>
            <p className={styles.eyebrow}>TEAM WORKSPACE</p>
            <h1>Meetings</h1>
            <p>Manage your upcoming calls, invite teammates, and revisit past meetings.</p>
          </div>
          <button type="button" className={styles.primaryButton} onClick={openForm} aria-haspopup="dialog" aria-expanded={showForm} aria-controls="schedule-meeting-form">
            + Schedule meeting
          </button>
        </div>

        {!loading && <div className={styles.summaryGrid} aria-label="Meeting summary">
          <article className={styles.summaryCard}><span>All meetings</span><strong>{meetings.length}</strong></article>
          <article className={styles.summaryCard}><span>Upcoming</span><strong>{meetings.filter((meeting) => ["SCHEDULED", "LIVE"].includes(meeting.status) && !isPastMeeting(meeting, now)).length}</strong></article>
          <article className={styles.summaryCard}><span>Live now</span><strong className={liveCount ? styles.liveNumber : ""}>{liveCount}</strong></article>
          <article className={styles.summaryCard}><span>Past meetings</span><strong>{meetings.filter((meeting) => isPastMeeting(meeting, now)).length}</strong></article>
        </div>}

        {showForm && (
          <div
            className={styles.modalBackdrop}
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeForm();
            }}
          >
            <section
              id="schedule-meeting-form"
              className={styles.modalDialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="schedule-meeting-dialog-title"
            >
              <form className={styles.modalForm} onSubmit={createMeeting}>
                <div className={styles.modalHeading}>
                  <div>
                    <h2 id="schedule-meeting-dialog-title">Schedule a meeting</h2>
                    <p>The host starts the room. Invited teammates can join after it goes live.</p>
                  </div>
                  <button type="button" className={styles.modalClose} aria-label="Close dialog" disabled={saving} onClick={closeForm}>×</button>
                </div>

                {formError && <p className={styles.modalError} role="alert">{formError}</p>}

                <div className={styles.formGrid}>
                  <label className={styles.field}>
                    <span>Meeting title</span>
                    <input name="title" required minLength={3} maxLength={160} placeholder="Weekly project review" autoFocus />
                  </label>
                  <label className={styles.field}>
                    <span>Date and time</span>
                    <input name="scheduledAt" type="datetime-local" min={localNow || undefined} required />
                  </label>
                  <label className={styles.field}>
                    <span>Duration</span>
                    <select name="durationMinutes" defaultValue="30">
                      {[15, 30, 45, 60, 90, 120, 180, 360].map((minutes) => (
                        <option key={minutes} value={minutes}>{minutes} minutes</option>
                      ))}
                    </select>
                  </label>
                  <label className={`${styles.field} ${styles.agendaField}`}>
                    <span>Agenda</span>
                    <textarea name="agenda" rows={3} maxLength={10000} placeholder="Topics and preparation notes" />
                  </label>
                </div>

                <div className={styles.peopleSection}>
                  <div className={styles.peopleHeader}>
                    <div>
                      <h3>Invite teammates</h3>
                      <p>Invite any active teammate in the organization.</p>
                    </div>
                    <span className={styles.selectedCount}>{selectedPeople.length} selected</span>
                  </div>
                  <input
                    className={styles.search}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search people or department"
                    aria-label="Search teammates"
                  />
                  {selectedPeople.length > 0 && <div className={styles.selectedPeople} aria-label="Selected invitees">
                    {selectedPeople.map((id) => {
                      const person = people.find((entry) => entry.id === id);
                      if (!person) return null;
                      return <button type="button" key={id} onClick={() => togglePerson(id)} aria-label={`Remove ${person.name}`}>
                        {person.name}<span aria-hidden="true">×</span>
                      </button>;
                    })}
                  </div>}
                  <div className={styles.peopleList}>
                    {filteredPeople.length ? filteredPeople.map((person) => (
                      <label key={person.id} className={styles.personOption}>
                        <input
                          type="checkbox"
                          checked={selectedPeople.includes(person.id)}
                          onChange={() => togglePerson(person.id)}
                        />
                        <span className={styles.personAvatar}>{person.name.slice(0, 1).toUpperCase()}</span>
                        <span className={styles.personInfo}>
                          <strong>{person.name}</strong>
                          <small>{person.department} · {person.position.toLowerCase().replaceAll("_", " ")}</small>
                        </span>
                      </label>
                    )) : <p className={styles.noPeople}>No teammates found.</p>}
                  </div>
                </div>
                <div className={styles.formActions}>
                  <button type="button" className={styles.secondaryButton} disabled={saving} onClick={closeForm}>Cancel</button>
                  <button type="submit" className={styles.primaryButton} disabled={saving}>
                    {saving ? "Scheduling…" : "Schedule meeting"}
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {loading ? <div className={styles.emptyState}>Loading your meetings…</div> : <>
          <div className={styles.meetingWorkspaceTools}>
            <div className={styles.meetingViewTabs} role="group" aria-label="Filter meetings">
              {([
                ["all", "All", meetings.length],
                ["upcoming", "Upcoming", meetings.filter((meeting) => ["SCHEDULED", "LIVE"].includes(meeting.status) && !isPastMeeting(meeting, now)).length],
                ["history", "Past", meetings.filter((meeting) => isPastMeeting(meeting, now)).length],
              ] as const).map(([value, label, count]) => (
                <button type="button" key={value} className={meetingView === value ? styles.activeMeetingTab : ""} onClick={() => setMeetingView(value)} aria-pressed={meetingView === value}>{label}<span>{count}</span></button>
              ))}
            </div>
            <label className={styles.searchWrap}>
              <span aria-hidden="true">⌕</span>
              <input className={styles.meetingSearch} value={meetingSearch} onChange={(event) => setMeetingSearch(event.target.value)} placeholder="Search meetings" aria-label="Search meetings" />
              {meetingSearch && <button type="button" className={styles.clearSearch} onClick={() => setMeetingSearch("")} aria-label="Clear meeting search">×</button>}
            </label>
          </div>

          <section className={styles.section} aria-live="polite">
            <div className={styles.sectionHeading}>
              <div><h2>{meetingView === "upcoming" ? "Upcoming & live" : meetingView === "history" ? "Past meetings" : "All meetings"}</h2><p>{meetingView === "upcoming" ? "Your next calls and meetings happening now." : meetingView === "history" ? "Review completed and cancelled meetings." : "Meetings are sorted by date, newest first."}</p></div>
              <span className={styles.count}>{visibleMeetings.length}</span>
            </div>
            {meetingView !== "upcoming" ? (
              <div className={styles.historyTableWrap}>
                <p className={styles.tableHint}>Scroll horizontally to see all meeting details.</p>
                <table className={styles.historyTable}>
                  <thead><tr>
                    <th scope="col">Meeting</th><th scope="col">MOM / Minutes</th><th scope="col">Date &amp; time</th><th scope="col">Host</th>
                    <th scope="col">Invited</th><th scope="col">Attended</th><th scope="col">Duration</th>
                    <th scope="col">Status</th><th scope="col"><span className={styles.visuallyHidden}>Meeting details</span></th>
                  </tr></thead>
                  <tbody>{visibleMeetings.length ? visibleMeetings.map((meeting) => (
                    <MeetingHistoryRow
                      key={meeting.id}
                      meeting={meeting}
                      now={now}
                      isHost={Number(meeting.hostId) === Number(user?.id)}
                      onOpenMeeting={() => router.push(`/dashboard/meetings/${meeting.id}`)}
                    />
                  )) : <tr><td className={styles.tableEmpty} colSpan={9}>{meetingSearch ? "No meetings match this search." : meetingView === "history" ? "No past meetings yet." : "No meetings yet."}</td></tr>}</tbody>
                </table>
              </div>
            ) : meetingView === "upcoming" && visibleMeetings.length ? <div className={styles.meetingGrid}>
              {visibleMeetings.map((meeting) => (
                <article key={meeting.id} className={styles.meetingCard}>
                  <div className={styles.cardTop}>
                    <span className={`${styles.status} ${meeting.status === "LIVE" ? styles.live : meeting.status === "ENDED" ? styles.ended : meeting.status === "CANCELLED" ? styles.cancelled : ""}`}>
                      {meeting.status === "LIVE" ? "● LIVE NOW" : meeting.status === "SCHEDULED" ? "UPCOMING" : meeting.status}
                    </span>
                    <span className={styles.duration}>{meeting.durationMinutes} min</span>
                  </div>
                  <h3>{meeting.title}</h3>
                  <p className={styles.meetingTime}>{formatDate(meeting.scheduledAt)}</p>
                  {meeting.agenda && <p className={styles.agenda}>{meeting.agenda}</p>}
                  <div className={styles.cardMeta}><span>Host</span><strong>{meeting.host?.name || "Team member"}</strong><span>People</span><strong>{meeting.participants.length}</strong></div>
                  <div className={styles.cardFooter}>
                    <button type="button" className={styles.joinButton} onClick={() => router.push(`/dashboard/meetings/${meeting.id}`)}>
                      {meeting.status === "LIVE" ? "Join meeting" : meeting.status === "SCHEDULED" ? "Open meeting" : "View details"}
                    </button>
                  </div>
                </article>
              ))}
            </div> : (
              <div className={styles.emptyState}>
                <span className={styles.emptyIcon} aria-hidden="true">{meetingSearch ? "⌕" : "▣"}</span>
                <strong>{meetingSearch ? "No matching meetings" : meetingView === "upcoming" ? "Nothing scheduled yet" : meetingView === "history" ? "No past meetings yet" : "No meetings yet"}</strong>
                <span>{meetingSearch ? "Try another title, agenda, or host name." : meetingView === "upcoming" ? "Schedule a meeting and invite your teammates." : "Your meetings will show up here."}</span>
                {!meetingSearch && meetingView === "upcoming" && <button type="button" className={styles.emptyAction} onClick={openForm}>Schedule your first meeting</button>}
              </div>
            )}
          </section>
        </>}
      </section>
    </ProtectedRoute>
  );
}
