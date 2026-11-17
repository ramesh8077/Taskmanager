"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LiveKitRoom, RoomAudioRenderer, VideoConference } from "@livekit/components-react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import styles from "./Meetings.module.css";

interface MeetingParticipant {
  id: number;
  userId: number;
  participantRole: "HOST" | "PARTICIPANT";
  user: { id: number; name: string; position: string; department: string };
}

interface Meeting {
  id: number;
  title: string;
  agenda: string | null;
  scheduledAt: string;
  durationMinutes: number;
  status: "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
  hostId: number;
  host: { id: number; name: string };
  participants: MeetingParticipant[];
}

interface Attendance {
  id: number;
  joinedAt: string;
  leftAt: string | null;
  user: { id: number; name: string };
}

interface JoinInfo {
  token: string;
  serverUrl: string;
}

function messageFrom(error: unknown, fallback: string) {
  return (error as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

function clock(value: string | null) {
  if (!value) return "In meeting";
  return new Intl.DateTimeFormat("en-IN", { timeStyle: "short" }).format(new Date(value));
}

export default function MeetingRoom({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const { user } = useAuth();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [joinInfo, setJoinInfo] = useState<JoinInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const leaving = useRef(false);

  const loadMeeting = useCallback(async () => {
    try {
      const response = await API.get(`/meetings/${meetingId}`);
      setMeeting(response.data?.data?.meeting || null);
      setAttendance(response.data?.data?.attendance || []);
    } catch (requestError) {
      setError(messageFrom(requestError, "Meeting details load nahi ho paayi."));
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { void loadMeeting(); }, [loadMeeting]);

  const isHost = !!meeting && Number(meeting.hostId) === Number(user?.id);
  const isLive = meeting?.status === "LIVE";

  async function join() {
    setBusy(true);
    setError("");
    try {
      const response = await API.post(`/meetings/${meetingId}/join`);
      setJoinInfo(response.data?.data);
      await loadMeeting();
    } catch (requestError) {
      setError(messageFrom(requestError, "Meeting join nahi ho paayi. Server settings check karein."));
    } finally {
      setBusy(false);
    }
  }

  const leave = useCallback(async (redirect = true) => {
    if (leaving.current) return;
    leaving.current = true;
    try {
      await API.post(`/meetings/${meetingId}/leave`);
    } catch {
      // Attendance is best-effort if the connection is already gone.
    } finally {
      setJoinInfo(null);
      leaving.current = false;
      if (redirect) router.replace("/dashboard/meetings");
    }
  }, [meetingId, router]);

  async function endMeeting() {
    setBusy(true);
    setError("");
    try {
      await API.post(`/meetings/${meetingId}/end`);
      setJoinInfo(null);
      toast.success("Meeting ended.");
      router.replace("/dashboard/meetings");
    } catch (requestError) {
      setError(messageFrom(requestError, "Meeting end nahi ho paayi. Server connection check karke retry karein."));
    } finally {
      setBusy(false);
    }
  }

  async function cancelMeeting() {
    setBusy(true);
    try {
      await API.post(`/meetings/${meetingId}/cancel`);
      toast.success("Meeting cancel ho gayi.");
      router.replace("/dashboard/meetings");
    } catch (requestError) {
      setError(messageFrom(requestError, "Meeting cancel nahi ho paayi."));
      setBusy(false);
    }
  }

  const scheduledLabel = meeting
    ? new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(meeting.scheduledAt))
    : "";

  return (
    <ProtectedRoute>
      <section className={styles.roomPage}>
        <div className={styles.roomHeader}>
          <div>
            <h1>{loading ? "Loading meeting…" : meeting?.title || "Meeting unavailable"}</h1>
            {meeting && <p>{scheduledLabel} · {meeting.durationMinutes} minutes · Hosted by {meeting.host?.name}</p>}
          </div>
          <div className={styles.roomActions}>
            {isHost && meeting?.status === "SCHEDULED" && (
              <button className={styles.secondaryButton} onClick={() => void cancelMeeting()} disabled={busy}>Cancel meeting</button>
            )}
            {joinInfo && isHost && (
              <button className={styles.secondaryButton} onClick={() => void endMeeting()} disabled={busy}>
                {busy ? "Ending…" : "End for everyone"}
              </button>
            )}
          </div>
        </div>

        <div className={styles.roomPanel}>
          {joinInfo ? (
            <div className={styles.livekit}>
              <LiveKitRoom
                token={joinInfo.token}
                serverUrl={joinInfo.serverUrl}
                connect
                audio
                video
                onDisconnected={() => {
                  void (async () => {
                    await leave(false);
                    await loadMeeting();
                  })();
                }}
                data-lk-theme="default"
              >
                <VideoConference />
                <RoomAudioRenderer />
              </LiveKitRoom>
            </div>
          ) : (
            <div className={styles.roomNotice}>
              {loading ? <h2>Loading meeting details…</h2> : !meeting ? (
                <><h2>Meeting unavailable</h2><p>{error || "This meeting was removed or you are not an invited participant."}</p></>
              ) : meeting.status === "ENDED" || meeting.status === "CANCELLED" ? (
                <>
                  <h2>{meeting.status === "ENDED" ? "Meeting ended" : "Meeting cancelled"}</h2>
                  {meeting.agenda && <p>{meeting.agenda}</p>}
                  {error && <p className={styles.roomError}>{error}</p>}
                  <div className={styles.attendanceList}>
                    <strong>Attendance</strong>
                    {attendance.map((entry) => (
                      <div key={entry.id} className={styles.attendanceRow}>
                        <span>{entry.user?.name || "Participant"}</span>
                        <small>{clock(entry.joinedAt)} – {clock(entry.leftAt)}</small>
                      </div>
                    ))}
                    {!attendance.length && <small>No attendance sessions were recorded.</small>}
                  </div>
                  <button className={styles.secondaryButton} onClick={() => router.push("/dashboard/meetings")}>Back to meetings</button>
                </>
              ) : (
                <>
                  <h2>{isLive ? "Your team is in the meeting" : "Your meeting is ready"}</h2>
                  <p>
                    {isLive
                      ? "Camera and microphone permission will be requested when you join."
                      : isHost
                        ? "Starting the room will allow invited teammates to join."
                        : "The host needs to start the meeting before participants can join."}
                  </p>
                  {meeting.agenda && <p><strong>Agenda:</strong> {meeting.agenda}</p>}
                  {error && <p className={styles.roomError}>{error}</p>}
                  {(isHost || isLive) && (
                    <button className={styles.primaryButton} onClick={() => void join()} disabled={busy}>
                      {busy ? "Connecting…" : isHost && !isLive ? "Start and join meeting" : "Join meeting"}
                    </button>
                  )}
                  <div className={styles.attendanceList}>
                    <strong>Invited participants ({meeting.participants.length})</strong>
                    {meeting.participants.map((participant) => (
                      <div key={participant.id} className={styles.attendanceRow}>
                        <span>{participant.user?.name || "Participant"}{participant.participantRole === "HOST" ? " · Host" : ""}</span>
                        <small>{participant.user?.department || "Team"}</small>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>
    </ProtectedRoute>
  );
}
