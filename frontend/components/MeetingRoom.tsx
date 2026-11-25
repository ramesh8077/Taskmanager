"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { LiveKitRoom, RoomAudioRenderer, VideoConference, useParticipants, useRoomContext } from "@livekit/components-react";
import { RoomEvent, Track } from "livekit-client";
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

interface MeetingMinutes {
  summary: string;
  discussionTopics: string[];
  decisions: string[];
  actionItems: Array<{ task: string; owner: string; dueDate: string; priority: "High" | "Medium" | "Low" | "Not specified" }>;
  risksAndBlockers: string[];
  openQuestions: string[];
  nextMeeting: string;
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
  transcript: string | null;
  minutes: MeetingMinutes | null;
}

interface Attendance {
  id: number;
  joinedAt: string;
  leftAt: string | null;
  user: { id: number; name: string };
}

interface JoinInfo {
  serverUrl: string;
  token: string;
}

const MEETING_UI_TOPIC = "flippro-meeting-ui";
const REACTIONS = ["👍", "👏", "😂", "❤️", "🎉"];

interface ActiveMeetingRecording {
  recorder: MediaRecorder;
  audioContext: AudioContext;
  destination: MediaStreamAudioDestinationNode;
  sources: Map<string, MediaStreamAudioSourceNode>;
  chunks: BlobPart[];
  onTrackSubscribed: (track: import("livekit-client").Track) => void;
  onTrackUnsubscribed: (track: import("livekit-client").Track) => void;
}

function MeetingCallTools({ meeting, onMeetingUpdated, onRecordingReady }: { meeting: Meeting; onMeetingUpdated: (meeting: Meeting) => void; onRecordingReady: (audio: Blob) => void }) {
  const room = useRoomContext();
  const participants = useParticipants();
  const [panel, setPanel] = useState<"people" | "details" | "notes" | null>(null);
  const [handRaised, setHandRaised] = useState(false);
  const [raisedHands, setRaisedHands] = useState<Record<string, string>>({});
  const [reactions, setReactions] = useState<Array<{ id: string; emoji: string; name: string }>>([]);
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState("");
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [invitePickerOpen, setInvitePickerOpen] = useState(false);
  const [inviteablePeople, setInviteablePeople] = useState<Array<{ id: number; name: string; department: string; position: string }>>([]);
  const [loadingInvitees, setLoadingInvitees] = useState(false);
  const [inviteSearch, setInviteSearch] = useState("");
  const [selectedInvitees, setSelectedInvitees] = useState<number[]>([]);
  const [sendingInvites, setSendingInvites] = useState(false);
  const [recordingEnabled, setRecordingEnabled] = useState(false);
  const [remoteRecording, setRemoteRecording] = useState(false);
  const recordingRef = useRef<ActiveMeetingRecording | null>(null);

  useEffect(() => {
    const storageKey = `flippro-meeting-notes-${meeting.id}`;
    try {
      setNotes(window.localStorage.getItem(storageKey) || "");
    } catch {
      toast.error("Is browser mein meeting notes save nahi ho paayengi.");
    } finally {
      setNotesLoaded(true);
    }
  }, [meeting.id]);

  useEffect(() => {
    if (!notesLoaded) return;
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(`flippro-meeting-notes-${meeting.id}`, notes);
      } catch {
        toast.error("Meeting notes save nahi ho paayi.");
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [meeting.id, notes, notesLoaded]);

  useEffect(() => {
    const start = () => setCallStartedAt(Date.now());
    if (room.state === "connected") start();
    room.on(RoomEvent.Connected, start);
    return () => { room.off(RoomEvent.Connected, start); };
  }, [room]);

  useEffect(() => {
    if (!callStartedAt) return;
    const update = () => setElapsedSeconds(Math.floor((Date.now() - callStartedAt) / 1000));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [callStartedAt]);

  const callTime = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const isHost = room.localParticipant.identity === String(meeting.hostId);
  const activeIdentities = new Set(participants.map((participant) => participant.identity));
  const meetingPeople = meeting.participants
    .map((invitee) => ({ ...invitee, active: activeIdentities.has(String(invitee.userId)) }))
    .filter((invitee) => !inviteSearch.trim() || invitee.user.name.toLowerCase().includes(inviteSearch.trim().toLowerCase()))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.user.name.localeCompare(b.user.name));
  const candidatePeople = inviteablePeople.filter((person) =>
    !meeting.participants.some((invitee) => Number(invitee.userId) === Number(person.id)) &&
    `${person.name} ${person.department} ${person.position}`.toLowerCase().includes(inviteSearch.trim().toLowerCase()),
  );

  async function startRecording() {
    if (recordingRef.current || !isHost) return;
    try {
      const audioContext = new AudioContext();
      await audioContext.resume();
      const destination = audioContext.createMediaStreamDestination();
      const sources = new Map<string, MediaStreamAudioSourceNode>();
      const addTrack = (track: Track) => {
        const mediaTrack = track.mediaStreamTrack;
        if (!mediaTrack || mediaTrack.kind !== "audio" || sources.has(mediaTrack.id)) return;
        const source = audioContext.createMediaStreamSource(new MediaStream([mediaTrack]));
        source.connect(destination);
        sources.set(mediaTrack.id, source);
      };
      const removeTrack = (track: Track) => {
        const mediaTrack = track.mediaStreamTrack;
        const source = mediaTrack ? sources.get(mediaTrack.id) : null;
        if (!source) return;
        source.disconnect();
        sources.delete(mediaTrack.id);
      };
      const supportedMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      if (!supportedMimeType) throw new Error("This browser cannot record meeting audio in a supported format.");

      const recorder = new MediaRecorder(destination.stream, { mimeType: supportedMimeType });
      const recording: ActiveMeetingRecording = {
        recorder,
        audioContext,
        destination,
        sources,
        chunks: [],
        onTrackSubscribed: addTrack,
        onTrackUnsubscribed: removeTrack,
      };
      recordingRef.current = recording;

      for (const participant of [room.localParticipant, ...room.remoteParticipants.values()]) {
        const microphone = participant.getTrackPublication(Track.Source.Microphone)?.track;
        if (microphone) addTrack(microphone);
      }
      room.on(RoomEvent.TrackSubscribed, addTrack);
      room.on(RoomEvent.TrackUnsubscribed, removeTrack);
      recorder.ondataavailable = (event) => { if (event.data.size > 0) recording.chunks.push(event.data); };
      recorder.onstop = () => {
        const audio = new Blob(recording.chunks, { type: "audio/webm" });
        recordingRef.current = null;
        room.off(RoomEvent.TrackSubscribed, addTrack);
        room.off(RoomEvent.TrackUnsubscribed, removeTrack);
        for (const source of sources.values()) source.disconnect();
        void audioContext.close();
        setRecordingEnabled(false);
        if (room.state === "connected") void publish({ type: "mom-recording", enabled: false });
        if (audio.size > 0) {
          onRecordingReady(audio);
          toast.success("Recording ready. AI MOM will generate automatically when the meeting ends.");
        }
      };
      recorder.start(1000);
      setRecordingEnabled(true);
      void publish({ type: "mom-recording", enabled: true });
      toast.success("Audio recording started. AI will process it when you end the meeting.");
    } catch (recordingError) {
      toast.error(messageFrom(recordingError, "Meeting recording start nahi ho paayi."));
    }
  }

  function stopRecording() {
    const recording = recordingRef.current;
    if (!recording || recording.recorder.state === "inactive") return;
    recording.recorder.stop();
  }

  useEffect(() => () => {
    const recording = recordingRef.current;
    if (recording && recording.recorder.state !== "inactive") recording.recorder.stop();
  }, []);

  useEffect(() => {
    if (panel !== "people" || !invitePickerOpen || inviteablePeople.length) return;
    setLoadingInvitees(true);
    API.get("/meetings/people")
      .then((response) => setInviteablePeople(response.data?.data?.people || []))
      .catch(() => toast.error("Invite karne ke liye teammate list load nahi hui."))
      .finally(() => setLoadingInvitees(false));
  }, [invitePickerOpen, inviteablePeople.length, panel]);

  async function inviteSelectedPeople() {
    if (!selectedInvitees.length) return;
    setSendingInvites(true);
    try {
      const response = await API.post(`/meetings/${meeting.id}/invite`, { attendeeIds: selectedInvitees });
      const updatedMeeting = response.data?.data?.meeting as Meeting | undefined;
      if (updatedMeeting) onMeetingUpdated(updatedMeeting);
      toast.success("Teammates invited to the meeting.");
      setSelectedInvitees([]);
      setInviteSearch("");
      setInvitePickerOpen(false);
    } catch (error) {
      toast.error(messageFrom(error, "Invitations send nahi ho paayin."));
    } finally {
      setSendingInvites(false);
    }
  }

  useEffect(() => {
    const onData = (payload: Uint8Array, participant?: { identity: string; name?: string }, _kind?: unknown, topic?: string) => {
      if (topic !== MEETING_UI_TOPIC) return;
      try {
        const message = JSON.parse(new TextDecoder().decode(payload)) as { type?: string; raised?: boolean; emoji?: string; enabled?: boolean };
        const identity = participant?.identity;
        if (!identity) return;
        const name = participant?.name || identity;
        if (message.type === "hand") {
          setRaisedHands((current) => {
            const next = { ...current };
            if (message.raised) next[identity] = name;
            else delete next[identity];
            return next;
          });
        }
        if (message.type === "reaction" && REACTIONS.includes(message.emoji || "")) {
          const id = `${identity}-${Date.now()}-${Math.random()}`;
          setReactions((current) => [...current, { id, emoji: message.emoji || "", name }].slice(-5));
          window.setTimeout(() => setReactions((current) => current.filter((item) => item.id !== id)), 4500);
        }
        if (message.type === "mom-recording") setRemoteRecording(!!message.enabled);
      } catch {
        // Ignore unrelated or malformed room data packets.
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => { room.off(RoomEvent.DataReceived, onData); };
  }, [room]);

  async function publish(message: Record<string, unknown>) {
    try {
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(message)),
        { reliable: true, topic: MEETING_UI_TOPIC },
      );
    } catch {
      toast.error("Meeting action send nahi ho paayi.");
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Invite link copy nahi ho paaya.");
    }
  }

  function toggleHand() {
    const next = !handRaised;
    setHandRaised(next);
    const identity = room.localParticipant.identity;
    setRaisedHands((current) => {
      const updated = { ...current };
      if (next) updated[identity] = room.localParticipant.name || "You";
      else delete updated[identity];
      return updated;
    });
    void publish({ type: "hand", raised: next });
  }

  return (
    <>
      <div className={styles.meetingQuickActions} aria-label="Meeting options">
        {remoteRecording && !recordingEnabled && <span className={styles.recordingNotice}><span aria-hidden="true">●</span> AI MOM recording</span>}
        {isHost && <button type="button" className={recordingEnabled ? styles.recordingActiveButton : ""} onClick={() => recordingEnabled ? stopRecording() : void startRecording()} aria-pressed={recordingEnabled} title="Capture meeting audio for AI Minutes of Meeting">
          <span aria-hidden="true">●</span> {recordingEnabled ? "Stop AI MOM" : "Enable AI MOM"}
        </button>}
        <button type="button" onClick={() => setPanel((value) => value === "people" ? null : "people")} aria-pressed={panel === "people"}>
          <span aria-hidden="true">♙</span> Participants <b>{meeting.participants.length}</b>
        </button>
        <button type="button" onClick={() => setPanel((value) => value === "details" ? null : "details")} aria-pressed={panel === "details"}>
          <span aria-hidden="true">ⓘ</span> Details
        </button>
        <button type="button" onClick={() => setPanel((value) => value === "notes" ? null : "notes")} aria-pressed={panel === "notes"}>
          <span aria-hidden="true">▤</span> Notes
        </button>
        <span className={styles.callTimer} aria-label={`Call duration ${callTime}`}><span aria-hidden="true">●</span> {callTime}</span>
        <button type="button" onClick={() => void copyInvite()}><span aria-hidden="true">↗</span> {copied ? "Copied" : "Copy invite"}</button>
        <button type="button" onClick={toggleHand} aria-pressed={handRaised}><span aria-hidden="true">✋</span> {handRaised ? "Lower hand" : "Raise hand"}</button>
        <div className={styles.reactionMenu} aria-label="Send a reaction">
          {REACTIONS.map((emoji) => (
            <button key={emoji} type="button" aria-label={`Send ${emoji} reaction`} title={`Send ${emoji}`} onClick={() => void publish({ type: "reaction", emoji })}>{emoji}</button>
          ))}
        </div>
      </div>

      {panel && (
        <aside className={styles.meetingSidePanel} aria-label={panel === "people" ? "Meeting participants" : panel === "notes" ? "Meeting notes" : "Meeting details"}>
          <div className={styles.meetingPanelHeader}>
            <strong>{panel === "people" ? `Participants (${meeting.participants.length})` : panel === "notes" ? "My meeting notes" : "Meeting details"}</strong>
            <button type="button" aria-label="Close meeting panel" onClick={() => setPanel(null)}>×</button>
          </div>
          {panel === "people" ? (
            <div className={styles.participantPanelContent}>
              {isHost && <button type="button" className={styles.invitePeopleButton} onClick={() => { setInvitePickerOpen((value) => !value); setInviteSearch(""); }}>
                <span aria-hidden="true">＋</span> {invitePickerOpen ? "Back to participants" : "Invite people"}
              </button>}
              <label className={styles.participantSearch}>
                <span aria-hidden="true">⌕</span>
                <input value={inviteSearch} onChange={(event) => setInviteSearch(event.target.value)} placeholder={invitePickerOpen ? "Search teammates" : "Search participants"} aria-label="Search participants" />
              </label>
              {invitePickerOpen ? (
                <>
                  <div className={styles.inviteePickerList}>
                    {loadingInvitees && <p className={styles.participantEmpty}>Loading teammates…</p>}
                    {candidatePeople.map((person) => (
                      <label className={styles.inviteeOption} key={person.id}>
                        <input type="checkbox" checked={selectedInvitees.includes(person.id)} onChange={() => setSelectedInvitees((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} />
                        <span className={styles.livePersonAvatar}>{person.name.slice(0, 1).toUpperCase()}</span>
                        <span><strong>{person.name}</strong><small>{person.department}</small></span>
                      </label>
                    ))}
                    {!loadingInvitees && !candidatePeople.length && <p className={styles.participantEmpty}>No teammates available to invite.</p>}
                  </div>
                  <button type="button" className={styles.sendInvitesButton} disabled={!selectedInvitees.length || sendingInvites} onClick={() => void inviteSelectedPeople()}>
                    {sendingInvites ? "Inviting…" : `Invite ${selectedInvitees.length || "selected"}`}
                  </button>
                </>
              ) : (
                <>
                  <div className={styles.participantSectionTitle}>In the meeting ({meetingPeople.filter((person) => person.active).length})</div>
                  <div className={styles.livePeopleList}>
                    {meetingPeople.filter((person) => person.active).map((invitee) => {
                      const livePerson = participants.find((person) => person.identity === String(invitee.userId));
                      return <div className={styles.livePerson} key={invitee.id}>
                        <span className={styles.livePersonAvatar}>{invitee.user.name.slice(0, 1).toUpperCase()}</span>
                        <span><strong>{invitee.user.name}{livePerson?.isLocal ? " (You)" : ""}</strong><small>{invitee.participantRole === "HOST" ? "Host" : "Participant"} · {livePerson?.isMicrophoneEnabled ? "Mic on" : "Mic off"} · {livePerson?.isCameraEnabled ? "Camera on" : "Camera off"}</small></span>
                        {raisedHands[String(invitee.userId)] && <span title="Hand raised" aria-label="Hand raised">✋</span>}
                      </div>;
                    })}
                    {!meetingPeople.some((person) => person.active) && <p className={styles.participantEmpty}>No participants are connected yet.</p>}
                  </div>
                  <div className={styles.participantSectionTitle}>Not in the meeting ({meetingPeople.filter((person) => !person.active).length})</div>
                  <div className={styles.livePeopleList}>
                    {meetingPeople.filter((person) => !person.active).map((invitee) => <div className={styles.livePerson} key={invitee.id}>
                      <span className={styles.livePersonAvatar}>{invitee.user.name.slice(0, 1).toUpperCase()}</span>
                      <span><strong>{invitee.user.name}</strong><small>{invitee.participantRole === "HOST" ? "Host · Not joined" : "Invited · Not joined"}</small></span>
                    </div>)}
                    {!meetingPeople.length && <p className={styles.participantEmpty}>No participants match your search.</p>}
                  </div>
                </>
              )}
            </div>
          ) : panel === "details" ? (
            <div className={styles.meetingDetailsContent}>
              <h3>{meeting.title}</h3>
              <p>{new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(meeting.scheduledAt))}</p>
              <p>{meeting.durationMinutes} minutes · Hosted by {meeting.host?.name}</p>
              {meeting.agenda && <div><strong>Agenda</strong><p>{meeting.agenda}</p></div>}
              <button type="button" className={styles.panelCopyButton} onClick={() => void copyInvite()}>{copied ? "Invite link copied" : "Copy invite link"}</button>
            </div>
          ) : (
            <div className={styles.meetingNotesContent}>
              <p>Notes are saved in this browser and only visible to you.</p>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Capture decisions, questions, and next steps…"
                aria-label="Personal meeting notes"
                disabled={!notesLoaded}
              />
              <small>{notesLoaded ? "Autosaved" : "Loading notes…"}</small>
            </div>
          )}
        </aside>
      )}

      {!!reactions.length && <div className={styles.reactionToasts} aria-live="polite">{reactions.map((item) => <div key={item.id}><span>{item.emoji}</span><small>{item.name}</small></div>)}</div>}
    </>
  );
}

function messageFrom(error: unknown, fallback: string) {
  const requestError = error as {
    response?: { data?: { message?: string; error?: { message?: string } } };
    message?: string;
  };
  return requestError?.response?.data?.message || requestError?.response?.data?.error?.message || requestError?.message || fallback;
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
  const [momTranscript, setMomTranscript] = useState("");
  const [momAudio, setMomAudio] = useState<File | null>(null);
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [generatingMom, setGeneratingMom] = useState(false);
  const leaving = useRef(false);
  const autoMomAttempted = useRef<number | null>(null);

  const loadMeeting = useCallback(async () => {
    try {
      const response = await API.get(`/meetings/${meetingId}`);
      const meetingData = response.data?.data?.meeting || null;
      setMeeting(meetingData);
      setMomTranscript(meetingData?.transcript || "");
      setAttendance(response.data?.data?.attendance || []);
    } catch (requestError) {
      setError(messageFrom(requestError, "Meeting details load nahi ho paayi."));
    } finally {
      setLoading(false);
    }
  }, [meetingId]);

  useEffect(() => { void loadMeeting(); }, [loadMeeting]);

  function retryLoadingMeeting() {
    setError("");
    setLoading(true);
    void loadMeeting();
  }

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

  async function recordJoinedAttendance() {
    try {
      await API.post(`/meetings/${meetingId}/attend`);
      await loadMeeting();
    } catch (requestError) {
      setError(messageFrom(requestError, "Call connect ho gayi, lekin attendance save nahi ho paayi."));
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
      if (!redirect) leaving.current = false;
      if (redirect) router.replace("/dashboard/meetings");
    }
  }, [meetingId, router]);

  function handleRoomDisconnected() {
    if (leaving.current) return;
    setError("Call connection band ho gayi.");
    void leave(false).then(() => loadMeeting());
  }

  async function endMeeting() {
    setBusy(true);
    setError("");
    leaving.current = true;
    try {
      await API.post(`/meetings/${meetingId}/end`);
      setJoinInfo(null);
      await loadMeeting();
      toast.success("Meeting ended.");
    } catch (requestError) {
      leaving.current = false;
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

  const generateMOM = useCallback(async () => {
    if (!meeting) return;
    setGeneratingMom(true);
    setError("");
    try {
      let response;
      if (momAudio || recordedAudio) {
        const form = new FormData();
        form.append("audio", momAudio || recordedAudio as Blob, momAudio?.name || "meeting-recording.webm");
        response = await API.post(`/meetings/${meetingId}/minutes`, form, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 180000,
        });
      } else {
        response = await API.post(`/meetings/${meetingId}/minutes`, { transcript: momTranscript }, { timeout: 180000 });
      }
      const updatedMeeting = response.data?.data?.meeting as Meeting;
      setMeeting(updatedMeeting);
      setMomTranscript(updatedMeeting.transcript || "");
      setMomAudio(null);
      setRecordedAudio(null);
      toast.success("AI meeting minutes ready.");
    } catch (requestError) {
      setError(messageFrom(requestError, "AI MOM generate nahi ho paayi."));
    } finally {
      setGeneratingMom(false);
    }
  }, [meeting, momAudio, momTranscript, recordedAudio, meetingId]);

  useEffect(() => {
    if (meeting?.status !== "ENDED" || !recordedAudio || meeting.minutes || generatingMom) return;
    if (autoMomAttempted.current === meeting.id) return;
    autoMomAttempted.current = meeting.id;
    if (recordedAudio.size > 25 * 1024 * 1024) {
      setError("Recording is larger than 25 MB. Upload a shorter clip or paste the transcript to create the MOM.");
      return;
    }
    void generateMOM();
  }, [meeting, recordedAudio, generatingMom, generateMOM]);

  async function copyMOM() {
    if (!meeting?.minutes) return;
    const minutes = meeting.minutes;
    const text = [
      `# Minutes of Meeting: ${meeting.title}`,
      `\n${minutes.summary}`,
      "\n## Discussion topics",
      ...minutes.discussionTopics.map((item) => `- ${item}`),
      "\n## Decisions",
      ...minutes.decisions.map((item) => `- ${item}`),
      "\n## Action items",
      ...minutes.actionItems.map((item) => `- ${item.task} — ${item.owner}; due ${item.dueDate}; priority ${item.priority}`),
      "\n## Risks and blockers",
      ...minutes.risksAndBlockers.map((item) => `- ${item}`),
      "\n## Open questions",
      ...minutes.openQuestions.map((item) => `- ${item}`),
      minutes.nextMeeting ? `\nNext meeting: ${minutes.nextMeeting}` : "",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("MOM copied.");
    } catch {
      toast.error("MOM copy nahi ho paayi.");
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
            <p className={styles.roomEyebrow}>TEAM MEETING</p>
            <h1>{loading ? "Loading meeting…" : meeting?.title || "Meeting details"}</h1>
            {meeting && <p>{scheduledLabel} · {meeting.durationMinutes} minutes · Hosted by {meeting.host?.name}</p>}
          </div>
          <div className={styles.roomActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => router.push("/dashboard/meetings")}>Back to meetings</button>
            {isHost && meeting?.status === "SCHEDULED" && !joinInfo && (
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
            <div className={styles.liveCallShell}>
              <LiveKitRoom
                serverUrl={joinInfo.serverUrl}
                token={joinInfo.token}
                connect
                video
                audio
                onConnected={() => void recordJoinedAttendance()}
                onDisconnected={handleRoomDisconnected}
                onError={(callError) => setError(callError.message || "Call connect nahi ho paayi.")}
                className={styles.liveKitRoom}
              >
                <VideoConference />
                {meeting && <MeetingCallTools meeting={meeting} onMeetingUpdated={setMeeting} onRecordingReady={setRecordedAudio} />}
                <RoomAudioRenderer />
              </LiveKitRoom>
              <div className={styles.callFooter}>
                {error && <p className={styles.roomError}>{error}</p>}
                <button className={styles.secondaryButton} onClick={() => void leave()}>
                  Leave meeting
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.roomNotice}>
              {loading ? <h2>Loading meeting details…</h2> : !meeting ? (
                <div className={styles.unavailableState}>
                  <span className={styles.unavailableIcon} aria-hidden="true">!</span>
                  <p className={styles.unavailableEyebrow}>MEETING ROOM</p>
                  <h2>We couldn’t load this meeting</h2>
                  <p>{error || "This meeting may have been removed, or your account may not be invited."}</p>
                  <div className={styles.unavailableActions}>
                    <button type="button" className={styles.primaryButton} onClick={retryLoadingMeeting} disabled={loading}>{loading ? "Retrying…" : "Try again"}</button>
                    <button type="button" className={styles.secondaryButton} onClick={() => router.push("/dashboard/meetings")}>Back to meetings</button>
                  </div>
                </div>
              ) : meeting.status === "ENDED" || meeting.status === "CANCELLED" ? (
                <>
                  <h2>{meeting.status === "ENDED" ? "Meeting ended" : "Meeting cancelled"}</h2>
                  {meeting.agenda && <p>{meeting.agenda}</p>}
                  {error && <p className={styles.roomError}>{error}</p>}
                  {meeting.status === "ENDED" && (
                    <section className={styles.meetingMinutesSection}>
                      <div className={styles.minutesHeading}>
                        <div><span className={styles.minutesEyebrow}>AI ASSISTANT</span><h3>Minutes of Meeting</h3><p>Call ke dauran <strong>Enable AI MOM</strong> chalu karein; recording meeting end par automatically process hogi. Recording nahi hai toh audio upload ya transcript paste karke MOM banayein.</p></div>
                        {meeting.minutes && <button type="button" className={styles.secondaryButton} onClick={() => void copyMOM()}>Copy MOM</button>}
                      </div>
                      {meeting.minutes && (
                        <div className={styles.minutesResult}>
                          <section><h4>Summary</h4><p>{meeting.minutes.summary}</p></section>
                          {meeting.minutes.discussionTopics.length > 0 && <section><h4>Discussion topics</h4><ul>{meeting.minutes.discussionTopics.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>}
                          {meeting.minutes.decisions.length > 0 && <section><h4>Decisions</h4><ul>{meeting.minutes.decisions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>}
                          {meeting.minutes.actionItems.length > 0 && <section><h4>Action items</h4><div className={styles.minutesActions}>{meeting.minutes.actionItems.map((item, index) => <article key={`${index}-${item.task}`}><strong>{item.task}</strong><span>Owner: {item.owner}</span><span>Due: {item.dueDate}</span><span>Priority: {item.priority}</span></article>)}</div></section>}
                          {meeting.minutes.risksAndBlockers.length > 0 && <section><h4>Risks and blockers</h4><ul>{meeting.minutes.risksAndBlockers.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>}
                          {meeting.minutes.openQuestions.length > 0 && <section><h4>Open questions</h4><ul>{meeting.minutes.openQuestions.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>}
                          {meeting.minutes.nextMeeting && <section><h4>Next meeting</h4><p>{meeting.minutes.nextMeeting}</p></section>}
                        </div>
                      )}
                      {isHost ? (
                        <div className={styles.minutesInput}>
                          <label className={styles.field}><span>Meeting recording (audio, max 25 MB)</span><input type="file" accept="audio/flac,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/webm" onChange={(event) => { setMomAudio(event.target.files?.[0] || null); setRecordedAudio(null); }} /></label>
                          {recordedAudio && <small className={styles.minutesFileName}>In-call recording ready ({(recordedAudio.size / (1024 * 1024)).toFixed(1)} MB).</small>}
                          {recordedAudio && recordedAudio.size > 25 * 1024 * 1024 && <small className={styles.minutesRecordingTooLarge}>In-call audio exceeds 25 MB. Upload a shorter recording or paste its transcript.</small>}
                          {momAudio && <small className={styles.minutesFileName}>Selected: {momAudio.name}</small>}
                          <label className={styles.field}><span>Or paste the meeting transcript</span><textarea rows={7} maxLength={150000} value={momTranscript} onChange={(event) => { setMomTranscript(event.target.value); setMomAudio(null); setRecordedAudio(null); }} placeholder="Paste the meeting transcript here…" /></label>
                          <button type="button" className={styles.primaryButton} onClick={() => void generateMOM()} disabled={generatingMom || (!momAudio && !recordedAudio && !momTranscript.trim()) || Boolean(recordedAudio && recordedAudio.size > 25 * 1024 * 1024)}>
                            {generatingMom ? "Transcribing and preparing MOM…" : meeting.minutes ? "Regenerate MOM" : "Generate MOM with AI"}
                          </button>
                          <small>AI will not guess missing owners or deadlines. Review the minutes before sharing.</small>
                        </div>
                      ) : !meeting.minutes ? <p className={styles.minutesWaiting}>The meeting host can upload the recording or transcript to prepare the MOM.</p> : null}
                    </section>
                  )}
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
                <div className={styles.joinLobby}>
                  <section className={styles.joinCard}>
                    <span className={`${styles.lobbyStatus} ${isLive ? styles.lobbyLive : ""}`}>
                      <span aria-hidden="true">{isLive ? "●" : "◷"}</span> {isLive ? "LIVE NOW" : "SCHEDULED MEETING"}
                    </span>
                    <h2>{isLive ? "Your team is in the meeting" : isHost ? "Ready to start?" : "You’re invited"}</h2>
                    <p className={styles.lobbyDescription}>
                      {isLive
                        ? "Join the call when you’re ready. Your camera and microphone will connect after you join."
                        : isHost
                          ? "Start the room when you’re ready. Your invited teammates can join as soon as it’s live."
                          : "The meeting host will start the room. You can join as soon as it goes live."}
                    </p>
                    {meeting.agenda && <div className={styles.lobbyAgenda}><strong>Agenda</strong><p>{meeting.agenda}</p></div>}
                    <div className={styles.lobbyFacts}>
                      <div><small>When</small><strong>{scheduledLabel}</strong></div>
                      <div><small>Length</small><strong>{meeting.durationMinutes} minutes</strong></div>
                      <div><small>Host</small><strong>{meeting.host?.name || "Team member"}</strong></div>
                    </div>
                    {error && <p className={styles.roomError} role="alert">{error}</p>}
                    {(isHost || isLive) ? (
                      <button className={`${styles.primaryButton} ${styles.joinCta}`} onClick={() => void join()} disabled={busy}>
                        {busy ? "Connecting…" : isHost && !isLive ? "Start and join meeting" : "Join meeting"}
                      </button>
                    ) : <div className={styles.waitingHost}><span aria-hidden="true">◷</span><span><strong>Waiting for the host</strong><small>This page will be ready when the host starts the room.</small></span></div>}
                    <small className={styles.privacyHint}>Your browser will ask for camera and microphone access. You can change them during the call.</small>
                  </section>
                  <aside className={styles.lobbySidebar}>
                    <div className={styles.lobbyParticipantsHeading}><strong>Invited participants</strong><span>{meeting.participants.length}</span></div>
                    <div className={styles.lobbyParticipantList}>
                      {meeting.participants.map((participant) => (
                        <div key={participant.id} className={styles.lobbyParticipant}>
                          <span className={styles.lobbyAvatar}>{(participant.user?.name || "?").slice(0, 1).toUpperCase()}</span>
                          <span><strong>{participant.user?.name || "Participant"}</strong><small>{participant.participantRole === "HOST" ? "Host" : participant.user?.department || "Teammate"}</small></span>
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </ProtectedRoute>
  );
}
