"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import API from "@/lib/axios";
import { useAuth } from "@/context/AuthContext";
import {
  detectSpeechLanguage,
  selectVoiceForLanguage,
  stripCompletionCue,
  type AssistantLanguage,
} from "@/lib/voiceProfile";

interface DeadlineRequestAction {
  type: "SEND_DEADLINE_REQUEST";
  label: string;
  taskId: number;
  taskTitle: string;
  currentDeadline: string;
  requestedDeadline: string;
  reason: string;
  reportingToId: number | null;
  reportingToName: string;
  reportingToPosition: string;
  alreadyPending: boolean;
}

interface ChatItem {
  id: string;
  role: "user" | "assistant";
  text: string;
  language?: AssistantLanguage;
  actions?: DeadlineRequestAction[];
}

interface BrowserSpeechRecognitionAlternative {
  transcript: string;
}

interface BrowserSpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: BrowserSpeechRecognitionAlternative;
}

interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: BrowserSpeechRecognitionResult;
  };
}

interface BrowserSpeechRecognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

const SILENCE_COMPLETION_MS = 3000;

const AI_STATUS_PROMPTS = [
  { tag: "VOICE + TEXT", text: "Speak Hindi or English" },
  { tag: "SMART LISTEN", text: "Waits until you finish" },
  { tag: "DUAL VOICE", text: "Distinct HI & EN voices" },
  { tag: "TASK AI", text: "Manage tasks & deadlines" },
];

function getSpeechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function nextFutureDate(currentDeadline?: string) {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + 1);
  const tomorrow = base.toISOString().slice(0, 10);
  if (!currentDeadline || tomorrow > currentDeadline) return tomorrow;
  const afterCurrent = new Date(`${currentDeadline.slice(0, 10)}T00:00:00Z`);
  afterCurrent.setUTCDate(afterCurrent.getUTCDate() + 1);
  return afterCurrent.toISOString().slice(0, 10);
}

function TaskManagerAiBotIcon({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
      className="ai-bot-svg"
    >
      <line x1="24" y1="5" x2="24" y2="11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24" cy="4.5" r="2.6" fill="#fde047" className="ai-bot-beacon" />
      <rect x="9" y="11" width="30" height="24" rx="9" fill="url(#aiBotFaceGrad)" stroke="currentColor" strokeWidth="2.2" />
      <rect x="13" y="15.5" width="22" height="12.5" rx="5.5" fill="#0f172a" />
      <circle cx="19" cy="21.5" r="2.2" fill="#38bdf8" className="ai-bot-eye ai-bot-eye-left" />
      <circle cx="29" cy="21.5" r="2.2" fill="#38bdf8" className="ai-bot-eye ai-bot-eye-right" />
      <path d="M18 32L21.5 35L29.5 29" stroke="#4ade80" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M38.5 9.5L40 6L41.5 9.5L45 11L41.5 12.5L40 16L38.5 12.5L35 11L38.5 9.5Z" fill="#fde047" className="ai-bot-spark" />
      <defs>
        <linearGradient id="aiBotFaceGrad" x1="9" y1="11" x2="39" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f04422" />
          <stop offset="1" stopColor="#4f46e5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function MicIcon({ active }: { active?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 18v3M8 21h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerIcon({ muted }: { muted?: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M11 5L6 9H3v6h3l5 4V5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      {muted ? (
        <path d="M22 9l-6 6M16 9l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      )}
    </svg>
  );
}

function DeadlineRequestActionCard({
  action,
  onSubmitted,
}: {
  action: DeadlineRequestAction;
  onSubmitted: (message: string) => void;
}) {
  const [requestedDeadline, setRequestedDeadline] = useState(
    action.requestedDeadline || nextFutureDate(action.currentDeadline),
  );
  const [reason, setReason] = useState(
    action.reason || "Need additional time to complete the task deliverables.",
  );
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(
    action.alreadyPending ? `${action.reportingToName} (already pending)` : null,
  );
  const [error, setError] = useState("");

  async function handleSendRequest() {
    if (!requestedDeadline) {
      setError("Please select a requested deadline date.");
      return;
    }
    if (reason.trim().length < 5) {
      setError("Please enter a brief reason (at least 5 characters).");
      return;
    }
    setSending(true);
    setError("");
    try {
      const response = await API.post(`/tasks/${action.taskId}/deadline-requests`, {
        requestedDeadline,
        reason: reason.trim(),
      });
      const recipientName = response.data?.data?.reportingTo?.name || action.reportingToName;
      setSentTo(recipientName);
      toast.success(`Request sent to ${recipientName}.`);
      onSubmitted(
        `Deadline extension request for Task #${action.taskId} (“${action.taskTitle}”) to ${requestedDeadline} has been sent to ${recipientName}.`,
      );
    } catch (requestError) {
      const message = (requestError as { response?: { data?: { message?: string } } }).response?.data?.message ||
        "Could not send deadline extension request.";
      setError(message);
      toast.error(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="ai-action-card">
      <div className="ai-action-card-header">
        <strong>Task #{action.taskId}: {action.taskTitle}</strong>
        <span>Current deadline: {action.currentDeadline}</span>
      </div>
      <p className="ai-action-recipient">
        Reporting to: <strong>{action.reportingToName}</strong> ({action.reportingToPosition.replaceAll("_", " ")})
      </p>
      {sentTo ? (
        <div className="ai-action-sent" role="status">
          ✓ Request sent to {sentTo}
        </div>
      ) : (
        <div className="ai-action-form">
          <label>
            Requested deadline
            <input
              type="date"
              min={nextFutureDate(action.currentDeadline)}
              value={requestedDeadline}
              onChange={(event) => setRequestedDeadline(event.target.value)}
            />
          </label>
          <label>
            Reason
            <input
              type="text"
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason for deadline extension"
            />
          </label>
          {error && <p className="ai-action-error" role="alert">{error}</p>}
          <button
            type="button"
            disabled={sending}
            onClick={() => void handleSendRequest()}
            className="ai-send-request-button"
          >
            {sending ? "Sending request…" : action.label || "Send Request"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AiAssistantWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [promptIndex, setPromptIndex] = useState(0);
  const [messages, setMessages] = useState<ChatItem[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Hi! I am FlipPro TaskManager AI. Speak in Hindi or English (say 'done' or 'बस इतना ही' when finished) or type any command.",
      language: "en",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState<"speech" | "audio" | null>(null);
  const [transcribingVoice, setTranscribingVoice] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [autoSendVoice, setAutoSendVoice] = useState(true);
  const [voiceReplyEnabled, setVoiceReplyEnabled] = useState(true);
  const [micMode, setMicMode] = useState<"auto" | "hi-IN" | "en-IN">("auto");
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [activeVoiceProfile, setActiveVoiceProfile] = useState<string>("");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const nextIdRef = useRef(1);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const recorderRef = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: BlobPart[] } | null>(null);
  const baseInputRef = useRef("");
  const finalizedSpeechRef = useRef("");
  const spokenBufferRef = useRef("");
  const autoSendVoiceRef = useRef(true);
  const listeningIntendedRef = useRef(false);
  const cancelVoiceRef = useRef(false);
  const silenceTimerRef = useRef<number | null>(null);
  const attachSpeechRef = useRef<((recognition: BrowserSpeechRecognition, langCode: string) => void) | null>(null);

  useEffect(() => {
    autoSendVoiceRef.current = autoSendVoice;
  }, [autoSendVoice]);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const syncVoices = () => {
      setAvailableVoices(window.speechSynthesis.getVoices());
    };
    syncVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", syncVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", syncVoices);
    };
  }, []);

  function nextMessageId(prefix: string) {
    const id = nextIdRef.current;
    nextIdRef.current += 1;
    return `${prefix}-${id}`;
  }

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const speakText = useCallback((text: string, preferredLanguage?: AssistantLanguage) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) return;
    try {
      window.speechSynthesis.cancel();
      const detectedLang = preferredLanguage || detectSpeechLanguage(text);
      const voices = availableVoices.length ? availableVoices : window.speechSynthesis.getVoices();
      const profile = selectVoiceForLanguage(voices, detectedLang);
      const utterance = new SpeechSynthesisUtterance(text.replace(/[*#`_]/g, " ").slice(0, 700));
      utterance.lang = profile.langTag;
      if (profile.voice) utterance.voice = profile.voice;
      utterance.pitch = profile.pitch;
      utterance.rate = profile.rate;
      setActiveVoiceProfile(profile.label);
      utterance.onend = () => setActiveVoiceProfile("");
      utterance.onerror = () => setActiveVoiceProfile("");
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech synthesis is optional across environments.
    }
  }, [availableVoices]);

  const stopSpeaking = useCallback(() => {
    setActiveVoiceProfile("");
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore synthesis cleanup errors.
    }
  }, []);

  const sendMessage = useCallback(async (text: string, fromVoice = false) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const inputLanguage = detectSpeechLanguage(trimmed);
    const userMsg: ChatItem = {
      id: nextMessageId("user"),
      role: "user",
      text: trimmed,
      language: inputLanguage,
    };
    const historyPayload = messages
      .filter((item) => item.id !== "welcome")
      .slice(-10)
      .map((item) => ({ role: item.role, text: item.text }));

    setMessages((current) => [...current, userMsg]);
    setInput("");
    setLiveTranscript("");
    setLoading(true);

    try {
      const response = await API.post(
        "/ai/chat",
        { message: trimmed, history: historyPayload },
        { timeout: 60000 },
      );
      const data = response.data?.data as {
        reply?: string;
        replyLanguage?: AssistantLanguage;
        actions?: DeadlineRequestAction[];
      };
      const replyText = data?.reply || "Done.";
      const replyLang = data?.replyLanguage || detectSpeechLanguage(replyText) || inputLanguage;
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId("assistant"),
          role: "assistant",
          text: replyText,
          language: replyLang,
          actions: data?.actions || [],
        },
      ]);
      if (fromVoice && voiceReplyEnabled) {
        speakText(replyText, replyLang);
      }
    } catch (requestError) {
      const errorText = (requestError as { response?: { data?: { message?: string } } }).response?.data?.message ||
        "AI assistant could not process your request right now.";
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId("assistant-error"),
          role: "assistant",
          text: errorText,
          language: "en",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading, messages, speakText, voiceReplyEnabled]);

  const finishVoiceUtterance = useCallback((rawSpoken: string) => {
    clearSilenceTimer();
    listeningIntendedRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors.
      }
      recognitionRef.current = null;
    }
    setListening(false);
    setVoiceMode(null);
    setLiveTranscript("");

    const { cleaned } = stripCompletionCue(rawSpoken);
    const merged = [baseInputRef.current, cleaned].filter(Boolean).join(" ").trim();
    spokenBufferRef.current = "";
    finalizedSpeechRef.current = "";

    if (!merged) return;
    if (autoSendVoiceRef.current) {
      void sendMessage(merged, true);
    } else {
      setInput(merged);
    }
  }, [clearSilenceTimer, sendMessage]);

  const stopVoiceCapture = useCallback((cancel = false) => {
    clearSilenceTimer();
    listeningIntendedRef.current = false;
    cancelVoiceRef.current = cancel;

    if (recognitionRef.current) {
      const spokenSnapshot = spokenBufferRef.current;
      try {
        if (cancel) recognitionRef.current.abort();
        else recognitionRef.current.stop();
      } catch {
        // Ignore stop errors if already ended.
      }
      recognitionRef.current = null;
      setListening(false);
      setVoiceMode(null);
      setLiveTranscript("");
      if (!cancel && spokenSnapshot.trim()) {
        finishVoiceUtterance(spokenSnapshot);
      }
      return;
    }

    if (recorderRef.current) {
      const { recorder } = recorderRef.current;
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }
    if (cancel) {
      setListening(false);
      setVoiceMode(null);
      setLiveTranscript("");
    }
  }, [clearSilenceTimer, finishVoiceUtterance]);

  const closeDrawer = useCallback(() => {
    stopVoiceCapture(true);
    stopSpeaking();
    setOpen(false);
  }, [stopSpeaking, stopVoiceCapture]);

  useEffect(() => {
    if (open) return;
    const interval = window.setInterval(() => {
      setPromptIndex((current) => (current + 1) % AI_STATUS_PROMPTS.length);
    }, 4200);
    return () => window.clearInterval(interval);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, closeDrawer]);

  useEffect(() => () => {
    clearSilenceTimer();
    listeningIntendedRef.current = false;
    cancelVoiceRef.current = true;
    try {
      recognitionRef.current?.abort();
    } catch {
      // Ignore cleanup errors.
    }
    if (recorderRef.current && recorderRef.current.recorder.state !== "inactive") {
      recorderRef.current.recorder.stop();
    }
    stopSpeaking();
  }, [clearSilenceTimer, stopSpeaking]);

  const quickPrompts = user?.position === "MANAGER"
    ? [
        "Show overdue tasks across all teams",
        "Show pending deadline requests",
        "Show workspace summary",
      ]
    : [
        "Show my pending and overdue tasks",
        "Extend deadline of my task",
        "Show my upcoming meetings",
      ];

  const startAudioRecorderVoice = useCallback(async (prefixText: string) => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Voice recording is not supported in this browser. Please type your command.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      recorderRef.current = { recorder, stream, chunks };
      cancelVoiceRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        recorderRef.current = null;
        setListening(false);
        setVoiceMode(null);

        if (cancelVoiceRef.current || chunks.length === 0) return;

        const audioBlob = new Blob(chunks, { type: mimeType || "audio/webm" });
        if (audioBlob.size < 400) return;

        setTranscribingVoice(true);
        try {
          const form = new FormData();
          form.append("audio", audioBlob, mimeType.includes("mp4") ? "voice-command.m4a" : "voice-command.webm");
          const response = await API.post("/ai/transcribe", form, {
            headers: { "Content-Type": "multipart/form-data" },
            timeout: 30000,
          });
          const transcript = String(response.data?.data?.transcript || "").trim();
          const { cleaned } = stripCompletionCue(transcript);
          if (!cleaned) {
            toast.error("Voice samajh nahi aayi. Dobara bolein ya type karein.");
            return;
          }
          const combined = [prefixText.trim(), cleaned].filter(Boolean).join(" ").trim();
          if (autoSendVoiceRef.current) {
            void sendMessage(combined, true);
          } else {
            setInput(combined);
          }
        } catch (transcribeError) {
          const message = (transcribeError as { response?: { data?: { message?: string } } }).response?.data?.message ||
            "Voice transcribe nahi ho paayi.";
          toast.error(message);
        } finally {
          setTranscribingVoice(false);
        }
      };

      recorder.start(250);
      setListening(true);
      setVoiceMode("audio");
      setLiveTranscript("");
    } catch {
      toast.error("Microphone permission denied ya mic available nahi hai.");
    }
  }, [sendMessage]);

  const attachSpeechHandlers = useCallback((recognition: BrowserSpeechRecognition, langCode: string) => {
    recognition.lang = langCode;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let segmentFinal = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript || "";
        if (event.results[i].isFinal) segmentFinal += `${piece} `;
        else interimText += piece;
      }
      if (segmentFinal.trim()) {
        finalizedSpeechRef.current = `${finalizedSpeechRef.current} ${segmentFinal}`.trim();
      }
      const combinedVoice = `${finalizedSpeechRef.current} ${interimText}`.trim();
      spokenBufferRef.current = combinedVoice;

      const { cleaned, completed } = stripCompletionCue(combinedVoice);
      setLiveTranscript(cleaned || combinedVoice);
      const merged = [baseInputRef.current, cleaned].filter(Boolean).join(" ");
      setInput(merged);

      if (completed && cleaned) {
        finishVoiceUtterance(combinedVoice);
        return;
      }

      // Wait-for-completion: only finalize after 3s of unbroken silence once speech has started.
      clearSilenceTimer();
      if (combinedVoice.trim() && autoSendVoiceRef.current) {
        silenceTimerRef.current = window.setTimeout(() => {
          if (listeningIntendedRef.current && spokenBufferRef.current.trim()) {
            finishVoiceUtterance(spokenBufferRef.current);
          }
        }, SILENCE_COMPLETION_MS);
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return;
      if (event.error === "no-speech" && listeningIntendedRef.current) {
        // Keep waiting quietly until the user speaks or cancels.
        return;
      }
      clearSilenceTimer();
      listeningIntendedRef.current = false;
      recognitionRef.current = null;
      setListening(false);
      setVoiceMode(null);
      setLiveTranscript("");

      if (event.error === "not-allowed" || event.error === "audio-capture") {
        toast.error("Microphone permission allow karein voice command ke liye.");
        return;
      }
      if (event.error === "network" || event.error === "service-not-allowed") {
        void startAudioRecorderVoice(baseInputRef.current);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      if (cancelVoiceRef.current || !listeningIntendedRef.current) {
        setListening(false);
        setVoiceMode(null);
        return;
      }
      // Browser stopped continuous recognition mid-turn; seamlessly resume listening until completion.
      const SpeechRecognitionCtor = getSpeechRecognitionCtor();
      if (SpeechRecognitionCtor && attachSpeechRef.current) {
        try {
          const nextRecognition = new SpeechRecognitionCtor();
          recognitionRef.current = nextRecognition;
          attachSpeechRef.current(nextRecognition, langCode);
          nextRecognition.start();
          return;
        } catch {
          // Fall through to finish if restart is blocked.
        }
      }
      if (spokenBufferRef.current.trim()) {
        finishVoiceUtterance(spokenBufferRef.current);
      } else {
        listeningIntendedRef.current = false;
        setListening(false);
        setVoiceMode(null);
      }
    };
  }, [clearSilenceTimer, finishVoiceUtterance, startAudioRecorderVoice]);

  useEffect(() => {
    attachSpeechRef.current = attachSpeechHandlers;
  }, [attachSpeechHandlers]);

  function startVoiceInput() {
    if (loading || transcribingVoice) return;
    if (listening) {
      stopVoiceCapture(false);
      return;
    }

    stopSpeaking();
    const prefixText = input.trim();
    baseInputRef.current = prefixText;
    finalizedSpeechRef.current = "";
    spokenBufferRef.current = "";

    // In "auto" mode, if user wants Gemini multi-language audio auto-detection, or SpeechRecognition:
    // Use SpeechRecognition when available (instant streaming + completion cues), and Gemini /transcribe for Audio fallback!
    const SpeechRecognitionCtor = getSpeechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      void startAudioRecorderVoice(prefixText);
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      const recognitionLang = micMode === "hi-IN" ? "hi-IN" : "en-IN";
      cancelVoiceRef.current = false;
      listeningIntendedRef.current = true;
      recognitionRef.current = recognition;
      attachSpeechHandlers(recognition, recognitionLang);
      recognition.start();
      setListening(true);
      setVoiceMode("speech");
    } catch {
      listeningIntendedRef.current = false;
      void startAudioRecorderVoice(prefixText);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (listening) stopVoiceCapture(true);
    void sendMessage(input, false);
  }

  const hasDirectDeadlineAccess = user?.position === "MANAGER" ||
    user?.position === "SUB_MANAGER" ||
    user?.position === "TEAM_LEAD" ||
    Boolean(user?.canExtendDeadline);

  const activeStatus = AI_STATUS_PROMPTS[promptIndex];
  const micModeLabel = micMode === "auto" ? "Auto (HI+EN)" : micMode === "hi-IN" ? "Hindi" : "English";

  return (
    <>
      {!open && (
        <div className="ai-fab-dock">
          <div className="ai-fab-status-pill" key={promptIndex} aria-hidden="true">
            <span className="ai-fab-status-tag">{activeStatus.tag}</span>
            <span className="ai-fab-status-text">{activeStatus.text}</span>
          </div>
          <button
            type="button"
            className="ai-fab-launcher"
            aria-label="Open FlipPro TaskManager AI Bot (Voice & Text)"
            aria-expanded={open}
            onClick={() => setOpen(true)}
          >
            <span className="ai-fab-pulse-ring" aria-hidden="true" />
            <span className="ai-fab-orbit-ring" aria-hidden="true" />
            <span className="ai-fab-core">
              <TaskManagerAiBotIcon size={32} />
            </span>
            <span className="ai-fab-badge" aria-hidden="true">AI</span>
          </button>
        </div>
      )}

      {open && (
        <div
          className="ai-drawer-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDrawer();
          }}
        >
          <aside className="ai-drawer" role="dialog" aria-modal="true" aria-labelledby="ai-bot-title">
            <header className="ai-drawer-header">
              <div className="ai-drawer-identity">
                <div className="ai-drawer-avatar" aria-hidden="true">
                  <span className="ai-fab-orbit-ring" />
                  <TaskManagerAiBotIcon size={26} />
                </div>
                <div>
                  <span className="ai-drawer-eyebrow">FLIPPRO TASKMANAGER AI</span>
                  <h2 id="ai-bot-title">TaskManager AI Bot</h2>
                  <p className="ai-drawer-meta">
                    {user?.position?.replaceAll("_", " ")} · {user?.department} ·{" "}
                    {hasDirectDeadlineAccess ? "Deadline access enabled" : "Deadline request mode"}
                  </p>
                </div>
              </div>
              <div className="ai-header-controls">
                <button
                  type="button"
                  className={`ai-icon-toggle ${voiceReplyEnabled ? "is-active" : ""}`}
                  aria-pressed={voiceReplyEnabled}
                  title={voiceReplyEnabled ? "Dual Voice Reply ON (click to mute)" : "Dual Voice Reply OFF (click to enable)"}
                  onClick={() => {
                    if (voiceReplyEnabled) stopSpeaking();
                    setVoiceReplyEnabled((value) => !value);
                  }}
                >
                  <SpeakerIcon muted={!voiceReplyEnabled} />
                </button>
                <button type="button" className="work-item-dialog-close" aria-label="Close AI Bot" onClick={closeDrawer}>
                  ×
                </button>
              </div>
            </header>

            <div className="ai-voice-toolbar">
              <div className="ai-voice-options">
                <button
                  type="button"
                  className="ai-lang-chip"
                  onClick={() =>
                    setMicMode((current) =>
                      current === "auto" ? "hi-IN" : current === "hi-IN" ? "en-IN" : "auto",
                    )
                  }
                  title="Switch microphone language mode"
                >
                  Mic: {micModeLabel}
                </button>
                <label className="ai-autosend-toggle">
                  <input
                    type="checkbox"
                    checked={autoSendVoice}
                    onChange={(event) => setAutoSendVoice(event.target.checked)}
                  />
                  Auto-send on finish
                </label>
              </div>
              {activeVoiceProfile && (
                <div className="ai-voice-active-badge" role="status">
                  Speaking with: <strong>{activeVoiceProfile}</strong>
                </div>
              )}
              <div className="ai-quick-prompts" aria-label="Suggested prompts">
                {quickPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    disabled={loading}
                    onClick={() => void sendMessage(prompt, false)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div className="ai-messages" aria-live="polite">
              {messages.map((item) => (
                <div
                  key={item.id}
                  className={`ai-message ${item.role === "user" ? "is-user" : "is-assistant"}`}
                >
                  <div className="ai-message-bubble">
                    {item.role === "assistant" && item.id !== "welcome" && item.language && (
                      <span className={`ai-lang-pill ${item.language === "hi" ? "is-hi" : "is-en"}`}>
                        {item.language === "hi" ? "HI Voice" : "EN Voice"}
                      </span>
                    )}
                    <span>{item.text}</span>
                    {item.role === "assistant" && item.id !== "welcome" && (
                      <button
                        type="button"
                        className="ai-speak-btn"
                        aria-label={`Listen in ${item.language === "hi" ? "Hindi" : "English"}`}
                        title={`Listen in ${item.language === "hi" ? "Hindi" : "English"}`}
                        onClick={() => speakText(item.text, item.language)}
                      >
                        <SpeakerIcon />
                      </button>
                    )}
                  </div>
                  {item.actions?.map((action) =>
                    action.type === "SEND_DEADLINE_REQUEST" ? (
                      <DeadlineRequestActionCard
                        key={`${item.id}-${action.taskId}`}
                        action={action}
                        onSubmitted={(confirmation) =>
                          setMessages((current) => [
                            ...current,
                            {
                              id: nextMessageId("sent"),
                              role: "assistant",
                              text: confirmation,
                              language: "en",
                            },
                          ])
                        }
                      />
                    ) : null,
                  )}
                </div>
              ))}
              {(loading || transcribingVoice) && (
                <div className="ai-message is-assistant">
                  <div className="ai-message-bubble is-thinking">
                    <span className="ai-thinking-wave" aria-hidden="true">
                      <i /><i /><i />
                    </span>
                    {transcribingVoice ? "Transcribing your voice command…" : "Analyzing permissions & running action…"}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="ai-composer-area">
              {listening && (
                <div className="ai-listening-bar" role="status">
                  <span className="ai-thinking-wave" aria-hidden="true">
                    <i /><i /><i />
                  </span>
                  <span className="ai-listening-text">
                    {voiceMode === "audio"
                      ? "Recording voice… Tap Done when finished"
                      : liveTranscript || "Listening… speak fully, then say 'done' / 'बस इतना ही'"}
                  </span>
                  <button type="button" className="ai-listening-stop" onClick={() => stopVoiceCapture(false)}>
                    Done
                  </button>
                  <button type="button" className="ai-listening-cancel" onClick={() => stopVoiceCapture(true)}>
                    Cancel
                  </button>
                </div>
              )}
              <form className="ai-input-form" onSubmit={handleSubmit}>
                <button
                  type="button"
                  disabled={loading || transcribingVoice}
                  onClick={startVoiceInput}
                  className={`ai-mic-button ${listening ? "is-listening" : ""}`}
                  aria-label={listening ? "Finish voice input" : "Speak voice command"}
                  aria-pressed={listening}
                  title={listening ? "Done speaking" : "Speak in Hindi or English"}
                >
                  <MicIcon active={listening} />
                </button>
                <input
                  type="text"
                  value={input}
                  maxLength={4000}
                  disabled={loading || transcribingVoice}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder={listening ? "Listening… speak until complete" : "Type or speak in Hindi / English…"}
                  aria-label="Message AI assistant"
                />
                <button type="submit" disabled={loading || transcribingVoice || !input.trim()}>
                  {loading ? "…" : "Send"}
                </button>
              </form>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
