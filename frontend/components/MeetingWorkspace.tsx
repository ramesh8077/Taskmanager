"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import ProtectedRoute from "@/components/ProtectedRoute";
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
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function apiMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { message?: string } } })?.response;
  return response?.data?.message || fallback;
}

export default function MeetingWorkspace() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedPeople, setSelectedPeople] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [meetingView, setMeetingView] = useState<"all" | "upcoming" | "history">("upcoming");
  const [meetingSearch, setMeetingSearch] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "1") setShowForm(true);
    if (params.get("view") === "history") setMeetingView("history");
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
  const upcoming = searchedMeetings.filter((meeting) => ["SCHEDULED", "LIVE"].includes(meeting.status));
  const history = searchedMeetings.filter((meeting) => ["ENDED", "CANCELLED"].includes(meeting.status));
  const liveCount = meetings.filter((meeting) => meeting.status === "LIVE").length;
  const visibleMeetings = meetingView === "all"
    ? searchedMeetings
    : meetingView === "upcoming"
      ? upcoming
      : history;

  async function createMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const localStart = String(form.get("scheduledAt") || "");
    if (!localStart) {
      toast.error("Meeting ka date aur time select karein.");
      return;
    }

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
      setShowForm(false);
      formElement.reset();
      await loadData();
    } catch (error) {
      toast.error(apiMessage(error, "Meeting schedule nahi ho paayi."));
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
          <button type="button" className={styles.primaryButton} onClick={() => setShowForm((value) => !value)} aria-expanded={showForm} aria-controls="schedule-meeting-form">
            {showForm ? "Close form" : "+ Schedule meeting"}
          </button>
        </div>

        {!loading && <div className={styles.summaryGrid} aria-label="Meeting summary">
          <article className={styles.summaryCard}><span>All meetings</span><strong>{meetings.length}</strong></article>
          <article className={styles.summaryCard}><span>Upcoming</span><strong>{meetings.filter((meeting) => meeting.status === "SCHEDULED").length}</strong></article>
          <article className={styles.summaryCard}><span>Live now</span><strong className={liveCount ? styles.liveNumber : ""}>{liveCount}</strong></article>
          <article className={styles.summaryCard}><span>Past meetings</span><strong>{meetings.filter((meeting) => ["ENDED", "CANCELLED"].includes(meeting.status)).length}</strong></article>
        </div>}

        {showForm && (
          <form id="schedule-meeting-form" className={styles.form} onSubmit={createMeeting}>
            <div className={styles.formHeader}>
              <div>
                <h2>Schedule a meeting</h2>
                <p>The host starts the room. Invited teammates can join after it goes live.</p>
              </div>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Meeting title</span>
                <input name="title" required minLength={3} maxLength={160} placeholder="Weekly project review" />
              </label>
              <label className={styles.field}>
                <span>Date and time</span>
                <input name="scheduledAt" type="datetime-local" required />
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
              <button type="button" className={styles.secondaryButton} onClick={() => setShowForm(false)}>Cancel</button>
              <button type="submit" className={styles.primaryButton} disabled={saving}>
                {saving ? "Scheduling…" : "Schedule meeting"}
              </button>
            </div>
          </form>
        )}

        {loading ? <div className={styles.emptyState}>Loading your meetings…</div> : <>
          <div className={styles.meetingWorkspaceTools}>
            <div className={styles.meetingViewTabs} role="group" aria-label="Filter meetings">
              {([
                ["upcoming", "Upcoming", meetings.filter((meeting) => ["SCHEDULED", "LIVE"].includes(meeting.status)).length],
                ["history", "Past", meetings.filter((meeting) => ["ENDED", "CANCELLED"].includes(meeting.status)).length],
                ["all", "All", meetings.length],
              ] as const).map(([value, label, count]) => (
                <button type="button" key={value} className={meetingView === value ? styles.activeMeetingTab : ""} onClick={() => setMeetingView(value)} aria-pressed={meetingView === value}>{label}<span>{count}</span></button>
              ))}
            </div>
            <label className={styles.searchWrap}>
              <span aria-hidden="true">⌕</span>
              <input className={styles.meetingSearch} value={meetingSearch} onChange={(event) => setMeetingSearch(event.target.value)} placeholder="Search meetings" aria-label="Search meetings" />
            </label>
          </div>

          <section className={styles.section} aria-live="polite">
            <div className={styles.sectionHeading}>
              <div><h2>{meetingView === "upcoming" ? "Upcoming & live" : meetingView === "history" ? "Past meetings" : "All meetings"}</h2><p>{meetingView === "upcoming" ? "Your next calls and meetings happening now." : meetingView === "history" ? "Review completed and cancelled meetings." : "Every meeting in one place, newest scheduled first."}</p></div>
              <span className={styles.count}>{visibleMeetings.length}</span>
            </div>
            {visibleMeetings.length ? <div className={styles.meetingGrid}>
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
                {!meetingSearch && meetingView === "upcoming" && <button type="button" className={styles.emptyAction} onClick={() => setShowForm(true)}>Schedule your first meeting</button>}
              </div>
            )}
          </section>
        </>}
      </section>
    </ProtectedRoute>
  );
}
