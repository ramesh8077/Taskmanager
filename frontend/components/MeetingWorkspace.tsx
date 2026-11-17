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

  const upcoming = meetings.filter((meeting) => ["SCHEDULED", "LIVE"].includes(meeting.status));
  const history = meetings.filter((meeting) => ["ENDED", "CANCELLED"].includes(meeting.status));

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
            <p>Schedule a meeting, invite your team, and join from this workspace.</p>
          </div>
          <button className={styles.primaryButton} onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Close form" : "+ Schedule meeting"}
          </button>
        </div>

        {showForm && (
          <form className={styles.form} onSubmit={createMeeting}>
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
                  <p>Only people within your team access scope are listed.</p>
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

        {loading ? (
          <div className={styles.emptyState}>Loading meetings…</div>
        ) : (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <div><h2>Upcoming & live</h2><p>Meetings you host or have been invited to.</p></div>
                <span className={styles.count}>{upcoming.length}</span>
              </div>
              {upcoming.length ? (
                <div className={styles.meetingGrid}>
                  {upcoming.map((meeting) => (
                    <article key={meeting.id} className={styles.meetingCard}>
                      <div className={styles.cardTop}>
                        <span className={`${styles.status} ${meeting.status === "LIVE" ? styles.live : ""}`}>
                          {meeting.status === "LIVE" ? "● LIVE NOW" : "SCHEDULED"}
                        </span>
                        <span className={styles.duration}>{meeting.durationMinutes} min</span>
                      </div>
                      <h3>{meeting.title}</h3>
                      <p className={styles.meetingTime}>{formatDate(meeting.scheduledAt)}</p>
                      {meeting.agenda && <p className={styles.agenda}>{meeting.agenda}</p>}
                      <div className={styles.cardFooter}>
                        <span className={styles.hostLabel}>Host: {meeting.host?.name || "Team member"}</span>
                        <button className={styles.joinButton} onClick={() => router.push(`/dashboard/meetings/${meeting.id}`)}>
                          {meeting.status === "LIVE" ? "Join meeting" : "Open details"}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>No upcoming meetings. Schedule one to get started.</div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeading}>
                <div><h2>Meeting history</h2><p>Past meetings and cancelled sessions.</p></div>
                <span className={styles.count}>{history.length}</span>
              </div>
              {history.length ? (
                <div className={styles.historyList}>
                  {history.map((meeting) => (
                    <button key={meeting.id} className={styles.historyRow} onClick={() => router.push(`/dashboard/meetings/${meeting.id}`)}>
                      <span className={styles.historyIcon}>M</span>
                      <span className={styles.historyTitle}><strong>{meeting.title}</strong><small>{formatDate(meeting.scheduledAt)} · {meeting.participants.length} participants</small></span>
                      <span className={`${styles.status} ${meeting.status === "ENDED" ? styles.ended : ""}`}>{meeting.status}</span>
                      <span aria-hidden="true">›</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>Completed meetings will appear here.</div>
              )}
            </section>
          </>
        )}
      </section>
    </ProtectedRoute>
  );
}
