"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import API from "@/lib/axios";
import { useAuth } from "@/context/AuthContext";
import styles from "./TeamChat.module.css";
import {
  describeMessagePreview,
  formatDateDividerLabel,
  formatDuration,
  formatFileSize,
  formatFullTimestamp,
  formatMessageTime,
  getDateKey,
  sortAndMergeMessages,
  type ChatAttachmentItem,
  type ChatMember,
  type ChatMessageItem,
  type ChatReceiptSummary,
} from "@/lib/chatFormat";

type ActiveMention = { start: number; end: number; query: string };

type PendingAttachment = {
  key: string;
  file: File;
  category: "image" | "video" | "audio" | "document";
  previewUrl?: string;
  durationSeconds?: number;
};

type MessageInfoMember = {
  id: number;
  name: string;
  role?: string;
  deliveredAt?: string;
  seenAt?: string;
};

type MessageInfoPayload = {
  message: {
    id: number;
    message: string;
    messageType?: string;
    createdAt: string;
    author?: { id: number; name: string };
    attachments?: ChatAttachmentItem[];
  };
  totalRecipients: number;
  seenBy: MessageInfoMember[];
  deliveredTo: MessageInfoMember[];
  notDeliveredTo: MessageInfoMember[];
  notSeenCount: number;
  receiptSummary: ChatReceiptSummary;
};

const MAX_FILES = 5;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const IMAGE_COMPRESS_THRESHOLD_BYTES = 2.5 * 1024 * 1024;

async function compressImageIfNeeded(file: File): Promise<File> {
  const mime = (file.type || "").toLowerCase();
  if (!mime.startsWith("image/") || mime === "image/gif" || file.size <= IMAGE_COMPRESS_THRESHOLD_BYTES) {
    return file;
  }
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const maxSide = 2048;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (!width || !height) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }
        if (width > maxSide || height > maxSide) {
          const ratio = Math.min(maxSide / width, maxSide / height);
          width = Math.max(1, Math.round(width * ratio));
          height = Math.max(1, Math.round(height * ratio));
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const targetMime = mime === "image/webp" ? "image/webp" : "image/jpeg";
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(objectUrl);
            if (!blob || blob.size >= file.size) {
              resolve(file);
              return;
            }
            const baseName = file.name.replace(/\.[^.]+$/, "");
            const ext = targetMime === "image/webp" ? "webp" : "jpg";
            resolve(new File([blob], `${baseName}.${ext}`, { type: targetMime }));
          },
          targetMime,
          0.85
        );
      } catch {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

function getApiBaseUrl(): string {
  return (API.defaults.baseURL || "/api").replace(/\/+$/, "");
}

function getAttachmentUrl(attachmentId: number, download = false): string {
  const base = `${getApiBaseUrl()}/chat/attachments/${attachmentId}`;
  return download ? `${base}?download=1` : base;
}

function getActiveMention(value: string, caret: number): ActiveMention | null {
  const beforeCaret = value.slice(0, caret);
  const match = /(?:^|\s)@([^@]*)$/.exec(beforeCaret);
  if (!match) return null;
  return {
    start: caret - match[1].length - 1,
    end: caret,
    query: match[1],
  };
}

function detectFileCategory(file: File): "image" | "video" | "audio" | "document" {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  const lowerName = file.name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp)$/.test(lowerName)) return "image";
  if (/\.(mp4|webm|mov|mkv)$/.test(lowerName)) return "video";
  if (/\.(mp3|ogg|wav|m4a|aac)$/.test(lowerName)) return "audio";
  return "document";
}

function pickSupportedRecorderMime(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || "";
}

function TickStatusSvg({ state }: { state: ChatReceiptSummary["tickState"] }) {
  if (state === "sent") {
    return (
      <svg viewBox="0 0 18 14" className={`${styles.chatTickIcon} ${styles.chatTickSent}`} aria-hidden="true">
        <path
          d="M2.5 7.5L6.5 11.5L14.5 2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  const colorClass = state === "seen" ? styles.chatTickSeen : styles.chatTickDelivered;
  return (
    <svg viewBox="0 0 22 14" className={`${styles.chatTickIcon} ${colorClass}`} aria-hidden="true">
      <path
        d="M1.8 7.5L5.6 11.3L12.8 2.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7.2 7.5L11 11.3L19.5 2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function renderMessageText(text: string, members: ChatMember[]): ReactNode {
  if (!text) return null;
  if (!members.length) return text;
  const escapedNames = members
    .map((m) => m.name.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escapedNames.length) return text;

  const pattern = new RegExp(`(@(?:${escapedNames.join("|")}))(?=$|[\\s,.!?])`, "gi");
  const parts = text.split(pattern);
  return parts.map((part, index) => {
    if (part.startsWith("@")) {
      return (
        <span key={`${index}-${part}`} className={styles.chatMentionToken}>
          {part}
        </span>
      );
    }
    return part;
  });
}

export default function TeamChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [hasMoreBefore, setHasMoreBefore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<ChatMessageItem | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);

  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [activeMemberIndex, setActiveMemberIndex] = useState(0);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ChatMessageItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [jumpRequest, setJumpRequest] = useState<{ id: number; seq: number } | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const [infoModalData, setInfoModalData] = useState<MessageInfoPayload | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<ChatAttachmentItem | null>(null);
  const [error, setError] = useState("");

  const messageListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | undefined>(undefined);
  const recordSecondsRef = useRef(0);
  const pendingFilesRef = useRef<PendingAttachment[]>([]);

  const latestIdRef = useRef(0);
  const oldestIdRef = useRef(0);
  const syncingRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const markedSeenIdsRef = useRef<Set<number>>(new Set());
  const searchTokenRef = useRef(0);

  useEffect(() => {
    pendingFilesRef.current = pendingFiles;
  }, [pendingFiles]);

  useEffect(() => {
    return () => {
      for (const item of pendingFilesRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      if (recordTimerRef.current !== undefined) window.clearInterval(recordTimerRef.current);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const markVisibleMessagesAsSeen = useCallback(
    async (items: ChatMessageItem[]) => {
      if (!user?.id || document.visibilityState !== "visible") return;
      const unseenIds = items
        .filter((msg) => msg.userId !== user.id && !markedSeenIdsRef.current.has(msg.id))
        .map((msg) => msg.id);
      if (!unseenIds.length) return;
      for (const id of unseenIds) markedSeenIdsRef.current.add(id);
      try {
        await API.post("/chat/receipts", {
          deliveredIds: unseenIds,
          seenIds: unseenIds,
        });
      } catch {
        for (const id of unseenIds) markedSeenIdsRef.current.delete(id);
      }
    },
    [user]
  );

  const refreshOwnStatuses = useCallback(
    async (currentMessages: ChatMessageItem[]) => {
      if (!user?.id || document.visibilityState !== "visible") return;
      const ownIds = currentMessages
        .filter((msg) => msg.userId === user.id)
        .slice(-40)
        .map((msg) => msg.id);
      if (!ownIds.length) return;
      try {
        const res = await API.get<{ data: { statuses: Record<number, ChatReceiptSummary> } }>(
          `/chat/messages/status?ids=${ownIds.join(",")}`
        );
        const statuses = res.data.data.statuses || {};
        setMessages((prev) =>
          prev.map((msg) =>
            statuses[msg.id] ? { ...msg, receiptSummary: statuses[msg.id] } : msg
          )
        );
      } catch {
        // Non-fatal fallback poll error.
      }
    },
    [user]
  );

  const syncNewMessages = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const after = latestIdRef.current;
      const url = after > 0 ? `/chat/messages?after=${after}` : "/chat/messages";
      const response = await API.get<{ data: { messages: ChatMessageItem[] } }>(url);
      const incoming = response.data.data.messages || [];
      if (incoming.length > 0) {
        setMessages((items) => {
          const merged = sortAndMergeMessages(items, incoming);
          void markVisibleMessagesAsSeen(merged);
          return merged;
        });
      }
    } catch {
      // Keep existing messages; next poll or WebSocket event will retry.
    } finally {
      syncingRef.current = false;
    }
  }, [markVisibleMessagesAsSeen]);

  useEffect(() => {
    latestIdRef.current = messages.length ? messages[messages.length - 1].id : 0;
    oldestIdRef.current = messages.length ? messages[0].id : 0;
  }, [messages]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      API.get<{ data: { messages: ChatMessageItem[]; hasMoreBefore?: boolean } }>("/chat/messages"),
      API.get<{ data: { members: ChatMember[] } }>("/chat/members"),
    ])
      .then(([messageResponse, memberResponse]) => {
        if (cancelled) return;
        const loaded = sortAndMergeMessages([], messageResponse.data.data.messages || []);
        setMessages(loaded);
        setHasMoreBefore(Boolean(messageResponse.data.data.hasMoreBefore));
        setMembers(memberResponse.data.data.members || []);
        latestIdRef.current = loaded.length ? loaded[loaded.length - 1].id : 0;
        oldestIdRef.current = loaded.length ? loaded[0].id : 0;
        void markVisibleMessagesAsSeen(loaded);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to load team chat right now. Please try again shortly.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [markVisibleMessagesAsSeen]);

  useEffect(() => {
    let pollTimer: number | undefined;
    let statusTick = 0;

    const schedulePolling = (connected: boolean) => {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      pollTimer = window.setInterval(
        () => {
          if (document.visibilityState !== "visible") return;
          void syncNewMessages();
          statusTick += 1;
          if (!connected || statusTick % 2 === 0) {
            setMessages((curr) => {
              void refreshOwnStatuses(curr);
              return curr;
            });
          }
        },
        connected ? 10000 : 2500
      );
    };

    const receiveMessage = (event: Event) => {
      const incoming = (event as CustomEvent<ChatMessageItem>).detail;
      if (incoming?.id) {
        setMessages((items) => {
          const merged = sortAndMergeMessages(items, [incoming]);
          void markVisibleMessagesAsSeen([incoming]);
          return merged;
        });
      }
    };

    const receiveReceiptUpdates = (event: Event) => {
      const updates = (event as CustomEvent<Array<{ messageId: number; receiptSummary: ChatReceiptSummary }>>).detail;
      if (!Array.isArray(updates) || updates.length === 0) return;
      const updateMap = new Map(updates.map((u) => [Number(u.messageId), u.receiptSummary]));
      setMessages((items) =>
        items.map((msg) => {
          const summary = updateMap.get(msg.id);
          return summary ? { ...msg, receiptSummary: summary } : msg;
        })
      );
    };

    const onNotification = (event: Event) => {
      const detail = (event as CustomEvent<{ type?: string }>).detail;
      if (detail?.type === "team_chat" || detail?.type === "chat_mention") {
        void syncNewMessages();
      }
    };

    const onRealtimeStatus = (event: Event) => {
      const connected = Boolean((event as CustomEvent<{ connected?: boolean }>).detail?.connected);
      schedulePolling(connected);
      if (connected) void syncNewMessages();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void syncNewMessages();
        setMessages((curr) => {
          void markVisibleMessagesAsSeen(curr);
          return curr;
        });
      }
    };

    const realtimeOpen =
      (window as Window & { __taskmanagerRealtimeOpen?: boolean }).__taskmanagerRealtimeOpen === true;
    schedulePolling(realtimeOpen);
    window.addEventListener("taskmanager:chat-message", receiveMessage);
    window.addEventListener("taskmanager:chat-receipts", receiveReceiptUpdates);
    window.addEventListener("taskmanager:notification", onNotification);
    window.addEventListener("taskmanager:realtime-status", onRealtimeStatus);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      window.removeEventListener("taskmanager:chat-message", receiveMessage);
      window.removeEventListener("taskmanager:chat-receipts", receiveReceiptUpdates);
      window.removeEventListener("taskmanager:notification", onNotification);
      window.removeEventListener("taskmanager:realtime-status", onRealtimeStatus);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [markVisibleMessagesAsSeen, refreshOwnStatuses, syncNewMessages]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container || messages.length === 0) return;
    if (!initialScrollDoneRef.current) {
      initialScrollDoneRef.current = true;
      container.scrollTop = container.scrollHeight;
      shouldAutoScrollRef.current = true;
      return;
    }
    if (shouldAutoScrollRef.current) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
  }, [messages.length]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) return;
    const token = ++searchTokenRef.current;
    const timer = window.setTimeout(async () => {
      try {
        const res = await API.get<{ data: { messages: ChatMessageItem[] } }>(
          `/chat/messages?search=${encodeURIComponent(query)}`
        );
        if (searchTokenRef.current === token) {
          setSearchResults(res.data.data.messages || []);
        }
      } catch {
        if (searchTokenRef.current === token) {
          setSearchResults([]);
        }
      } finally {
        if (searchTokenRef.current === token) {
          setSearching(false);
        }
      }
    }, 240);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (!jumpRequest) return;
    let cancelled = false;
    const targetId = jumpRequest.id;

    const focusTarget = () => {
      const el = document.getElementById(`chat-msg-${targetId}`);
      if (!el) return false;
      shouldAutoScrollRef.current = false;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedId(targetId);
      window.setTimeout(() => {
        setHighlightedId((current) => (current === targetId ? null : current));
      }, 2400);
      return true;
    };

    if (focusTarget()) return;

    API.get<{ data: { messages: ChatMessageItem[]; hasMoreBefore?: boolean } }>(
      `/chat/messages?around=${targetId}`
    )
      .then((res) => {
        if (cancelled) return;
        const aroundMsgs = res.data.data.messages || [];
        if (aroundMsgs.length > 0) {
          shouldAutoScrollRef.current = false;
          setMessages((prev) => sortAndMergeMessages(prev, aroundMsgs));
          if (typeof res.data.data.hasMoreBefore === "boolean") {
            setHasMoreBefore(res.data.data.hasMoreBefore);
          }
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (!cancelled) focusTarget();
            });
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("Unable to jump to that message right now.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [jumpRequest]);

  const jumpToMessage = (targetId: number) => {
    setSearchOpen(false);
    setJumpRequest((prev) => ({ id: targetId, seq: (prev?.seq || 0) + 1 }));
  };

  const loadOlderMessages = async () => {
    if (loadingOlder || !oldestIdRef.current) return;
    const container = messageListRef.current;
    const prevHeight = container?.scrollHeight || 0;
    const prevTop = container?.scrollTop || 0;
    setLoadingOlder(true);
    try {
      const res = await API.get<{ data: { messages: ChatMessageItem[]; hasMoreBefore?: boolean } }>(
        `/chat/messages?before=${oldestIdRef.current}&limit=50`
      );
      const older = res.data.data.messages || [];
      setHasMoreBefore(Boolean(res.data.data.hasMoreBefore));
      if (older.length > 0) {
        shouldAutoScrollRef.current = false;
        setMessages((prev) => sortAndMergeMessages(older, prev));
        requestAnimationFrame(() => {
          if (container) {
            const diff = container.scrollHeight - prevHeight;
            container.scrollTop = prevTop + diff;
          }
        });
      }
    } catch {
      setError("Unable to load older messages right now.");
    } finally {
      setLoadingOlder(false);
    }
  };

  const addPendingFiles = useCallback(async (files: FileList | File[]) => {
    const incoming = Array.from(files || []);
    if (!incoming.length) return;
    setError("");
    const currentCount = pendingFilesRef.current.length;
    if (currentCount + incoming.length > MAX_FILES) {
      setError(`You can attach up to ${MAX_FILES} files per message.`);
      return;
    }
    const nextItems: PendingAttachment[] = [];
    for (const rawFile of incoming) {
      const initialCategory = detectFileCategory(rawFile);
      const file = initialCategory === "image" ? await compressImageIfNeeded(rawFile) : rawFile;
      if (file.size > MAX_FILE_BYTES) {
        setError(`"${file.name}" exceeds the 15 MB attachment limit.`);
        return;
      }
      const category = detectFileCategory(file);
      nextItems.push({
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        category,
        previewUrl: category === "image" ? URL.createObjectURL(file) : undefined,
      });
    }
    setPendingFiles((prev) => [...prev, ...nextItems]);
  }, []);

  const removePendingFile = (key: string) => {
    setPendingFiles((prev) => {
      const target = prev.find((item) => item.key === key);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.key !== key);
    });
  };

  const filteredMembers = useMemo(() => {
    if (!activeMention) return [];
    const q = activeMention.query.trim().toLowerCase();
    return members.filter((member) => member.name.toLowerCase().includes(q));
  }, [activeMention, members]);

  const selectMember = (member: ChatMember) => {
    if (!activeMention) return;
    const before = draft.slice(0, activeMention.start);
    const after = draft.slice(activeMention.end);
    const nextDraft = `${before}@${member.name} ${after}`;
    const nextCaret = before.length + member.name.length + 2;
    setDraft(nextDraft);
    setActiveMention(null);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!activeMention || filteredMembers.length === 0) {
      if (event.key === "Escape") setActiveMention(null);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveMemberIndex((index) => (index + 1) % filteredMembers.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveMemberIndex((index) => (index - 1 + filteredMembers.length) % filteredMembers.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      selectMember(filteredMembers[activeMemberIndex] || filteredMembers[0]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setActiveMention(null);
    }
  };

  const sendPayload = async (
    textToSend: string,
    attachmentsToSend: PendingAttachment[],
    replyId: number | null
  ) => {
    if (sending) return;
    const trimmed = textToSend.trim();
    if (!trimmed && attachmentsToSend.length === 0) return;

    setSending(true);
    setError("");
    try {
      let response;
      if (attachmentsToSend.length > 0) {
        const formData = new FormData();
        if (trimmed) formData.append("message", trimmed);
        if (replyId) formData.append("replyToId", String(replyId));
        formData.append(
          "durations",
          JSON.stringify(attachmentsToSend.map((item) => item.durationSeconds ?? null))
        );
        for (const item of attachmentsToSend) {
          formData.append("files", item.file);
        }
        response = await API.post<{ data: { message: ChatMessageItem } }>("/chat/messages", formData, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 60000,
        });
      } else {
        response = await API.post<{ data: { message: ChatMessageItem } }>("/chat/messages", {
          message: trimmed,
          replyToId: replyId,
        });
      }
      const created = response.data.data.message;
      shouldAutoScrollRef.current = true;
      setMessages((items) => sortAndMergeMessages(items, [created]));
      setDraft("");
      setReplyTarget(null);
      setActiveMention(null);
      for (const item of attachmentsToSend) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      setPendingFiles([]);
    } catch (err: unknown) {
      const apiMsg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(apiMsg || "Unable to send your message. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendPayload(draft, pendingFiles, replyTarget?.id ?? null);
  };

  const startVoiceRecording = async () => {
    if (isRecording || sending) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording is not supported in this browser.");
      return;
    }
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickSupportedRecorderMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recordSecondsRef.current = 0;
      setRecordSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        recordSecondsRef.current += 1;
        setRecordSeconds(recordSecondsRef.current);
      }, 1000);
    } catch {
      setError("Microphone access was blocked. Allow microphone permission to record voice messages.");
    }
  };

  const cleanupRecorder = () => {
    if (recordTimerRef.current !== undefined) {
      window.clearInterval(recordTimerRef.current);
      recordTimerRef.current = undefined;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;
    setIsRecording(false);
  };

  const cancelVoiceRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.onstop = null;
      recorder.stop();
    }
    audioChunksRef.current = [];
    cleanupRecorder();
  };

  const finishVoiceRecording = (sendImmediately: boolean) => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanupRecorder();
      return;
    }
    const capturedDuration = Math.max(1, recordSecondsRef.current);
    recorder.onstop = () => {
      const chunks = audioChunksRef.current.slice();
      audioChunksRef.current = [];
      const actualMime = (recorder.mimeType || "audio/webm").split(";")[0];
      const ext = actualMime.includes("ogg") ? "ogg" : actualMime.includes("mp4") ? "m4a" : "webm";
      const blob = new Blob(chunks, { type: actualMime });
      cleanupRecorder();
      if (blob.size === 0) return;

      const file = new File([blob], `voice-note-${Date.now()}.${ext}`, { type: actualMime });
      const attachment: PendingAttachment = {
        key: `voice-${Date.now()}`,
        file,
        category: "audio",
        durationSeconds: capturedDuration,
      };
      if (sendImmediately) {
        void sendPayload(draft, [...pendingFiles, attachment], replyTarget?.id ?? null);
      } else {
        setPendingFiles((prev) => [...prev, attachment]);
      }
    };
    recorder.stop();
  };

  const downloadAttachment = async (attachment: ChatAttachmentItem) => {
    try {
      const response = await API.get<Blob>(getAttachmentUrl(attachment.id, true), {
        responseType: "blob",
        timeout: 60000,
      });
      const blobUrl = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = attachment.fileName || "attachment";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch {
      setError("Unable to download this attachment right now.");
    }
  };

  const openMessageInfo = async (messageId: number) => {
    setInfoLoading(true);
    setInfoModalData(null);
    try {
      const res = await API.get<{ data: MessageInfoPayload }>(`/chat/messages/${messageId}/info`);
      setInfoModalData(res.data.data);
    } catch {
      setError("Unable to load message details.");
    } finally {
      setInfoLoading(false);
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pastedFiles = event.clipboardData?.files;
    if (pastedFiles && pastedFiles.length > 0) {
      event.preventDefault();
      addPendingFiles(pastedFiles);
    }
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (event.dataTransfer?.files?.length) {
      addPendingFiles(event.dataTransfer.files);
    }
  };

  const renderedEntries = useMemo(() => {
    const entries: Array<
      | { kind: "divider"; key: string; label: string }
      | { kind: "message"; key: string; message: ChatMessageItem }
    > = [];
    let lastDateKey = "";
    for (const msg of messages) {
      const dateKey = getDateKey(msg.createdAt);
      if (dateKey !== lastDateKey) {
        lastDateKey = dateKey;
        entries.push({
          kind: "divider",
          key: `divider-${dateKey}-${msg.id}`,
          label: formatDateDividerLabel(msg.createdAt),
        });
      }
      entries.push({ kind: "message", key: `msg-${msg.id}`, message: msg });
    }
    return entries;
  }, [messages]);

  return (
    <section
      className={styles.chatContainer}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
      aria-label="Team Chat"
    >
      <header className={styles.chatHeader}>
        <div className={styles.chatTitleGroup}>
          <h1>Team Chat</h1>
          <p>Collaborate with active team members. Type @ to mention someone.</p>
        </div>

        <div className={styles.chatSearchWrap}>
          <div className={styles.chatSearchBox}>
            <span aria-hidden="true">🔍</span>
            <input
              type="search"
              className={styles.chatSearchInput}
              value={searchQuery}
              onFocus={() => {
                if (searchQuery.trim()) setSearchOpen(true);
              }}
              onChange={(event) => {
                const next = event.target.value;
                setSearchQuery(next);
                if (!next.trim()) {
                  searchTokenRef.current += 1;
                  setSearchResults([]);
                  setSearching(false);
                  setSearchOpen(false);
                } else {
                  setSearching(true);
                  setSearchOpen(true);
                }
              }}
              placeholder="Search messages, files, or members..."
              aria-label="Search messages"
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.chatSearchClear}
                onClick={() => {
                  setSearchQuery("");
                  setSearchResults([]);
                  setSearchOpen(false);
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          {searchOpen && searchQuery.trim() && (
            <div className={styles.chatSearchDropdown} role="region" aria-label="Search results">
              <div className={styles.chatSearchMeta}>
                {searching
                  ? "Searching messages..."
                  : searchResults.length === 1
                    ? "1 matching message"
                    : `${searchResults.length} matching messages`}
              </div>
              {!searching && searchResults.length === 0 ? (
                <div className={styles.chatSearchSnippet} style={{ padding: "8px 10px" }}>
                  No matching messages found.
                </div>
              ) : (
                searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    className={styles.chatSearchItem}
                    onClick={() => void jumpToMessage(result.id)}
                  >
                    <div className={styles.chatSearchItemHeader}>
                      <strong>{result.author?.name || "Team member"}</strong>
                      <time>{formatFullTimestamp(result.createdAt)}</time>
                    </div>
                    <span className={styles.chatSearchSnippet}>{describeMessagePreview(result)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </header>

      <div>
        {error && (
          <div className={styles.chatAlertBanner} role="alert">
            <span>{error}</span>
            <button
              type="button"
              className={styles.chatAlertDismiss}
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div className={styles.chatMessagesRegion}>
        <div
          ref={messageListRef}
          className={styles.chatMessagesScroll}
          aria-live="polite"
          onClick={() => setSearchOpen(false)}
          onScroll={() => {
            const container = messageListRef.current;
            if (!container) return;
            const distanceFromBottom =
              container.scrollHeight - container.scrollTop - container.clientHeight;
            shouldAutoScrollRef.current = distanceFromBottom < 140;
            setShowScrollBottom(distanceFromBottom > 220);
          }}
        >
          {hasMoreBefore && (
            <div className={styles.chatLoadOlderWrap}>
              <button
                type="button"
                className={styles.chatLoadOlderButton}
                onClick={() => void loadOlderMessages()}
                disabled={loadingOlder}
              >
                {loadingOlder ? "Loading older messages..." : "Load older messages"}
              </button>
            </div>
          )}

          {messages.length === 0 ? (
            <p className={styles.chatEmptyState}>
              No messages yet. Start the conversation below.
            </p>
          ) : (
            renderedEntries.map((entry) => {
              if (entry.kind === "divider") {
                return (
                  <div key={entry.key} className={styles.chatDateDivider}>
                    <span className={styles.chatDatePill}>{entry.label}</span>
                  </div>
                );
              }

              const item = entry.message;
              const isOwn = item.userId === user?.id;
              const isHighlighted = highlightedId === item.id;
              const attachments = item.attachments || [];
              const tickState = item.receiptSummary?.tickState || "sent";

              return (
                <article
                  key={entry.key}
                  id={`chat-msg-${item.id}`}
                  data-message-id={item.id}
                  className={`${styles.chatMessageRow} ${isOwn ? styles.isOwn : styles.isOther} ${
                    isHighlighted ? styles.isHighlighted : ""
                  }`}
                >
                  <div className={styles.chatBubble}>
                    <div className={styles.chatAuthorHeader}>
                      <span className={styles.chatAuthorName}>
                        {isOwn ? `${item.author?.name || "You"} (You)` : item.author?.name || "Team member"}
                      </span>
                    </div>

                    {item.replyTo && (
                      <button
                        type="button"
                        className={styles.chatReplyQuote}
                        onClick={() => void jumpToMessage(item.replyTo!.id)}
                        title="Jump to original message"
                      >
                        <strong>{item.replyTo.author?.name || "Team member"}</strong>
                        <span>{describeMessagePreview(item.replyTo)}</span>
                      </button>
                    )}

                    {item.message && (
                      <p className={styles.chatMessageText}>
                        {renderMessageText(item.message, members)}
                      </p>
                    )}

                    {attachments.length > 0 && (
                      <div className={styles.chatAttachmentList}>
                        {attachments.map((att) => {
                          const src = getAttachmentUrl(att.id, false);
                          if (att.category === "image") {
                            return (
                              <div key={att.id} className={styles.chatImageCard}>
                                <button
                                  type="button"
                                  className={styles.chatImagePreviewBtn}
                                  onClick={() => setLightboxImage(att)}
                                  aria-label={`View ${att.fileName}`}
                                >
                                  <img
                                    src={src}
                                    alt={att.fileName}
                                    className={styles.chatImagePreview}
                                    loading="lazy"
                                  />
                                </button>
                                <div className={styles.chatAttachmentFooter}>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {att.fileName} · {formatFileSize(att.fileSize)}
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.chatDownloadBtn}
                                    onClick={() => void downloadAttachment(att)}
                                  >
                                    Download
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          if (att.category === "video") {
                            return (
                              <div key={att.id} className={styles.chatVideoCard}>
                                <video controls preload="metadata" src={src} className={styles.chatVideoPlayer} />
                                <div className={styles.chatAttachmentFooter}>
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                    {att.fileName} · {formatFileSize(att.fileSize)}
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.chatDownloadBtn}
                                    onClick={() => void downloadAttachment(att)}
                                  >
                                    Download
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          if (att.category === "audio") {
                            return (
                              <div key={att.id} className={styles.chatAudioCard}>
                                <audio controls preload="metadata" src={src} className={styles.chatAudioPlayer} />
                                <div className={styles.chatAttachmentFooter} style={{ width: "100%" }}>
                                  <span>
                                    Voice message
                                    {att.durationSeconds ? ` · ${formatDuration(att.durationSeconds)}` : ""}
                                    {" · "}
                                    {formatFileSize(att.fileSize)}
                                  </span>
                                  <button
                                    type="button"
                                    className={styles.chatDownloadBtn}
                                    onClick={() => void downloadAttachment(att)}
                                  >
                                    Download
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={att.id} className={styles.chatDocCard}>
                              <div className={styles.chatDocMeta}>
                                <strong title={att.fileName}>{att.fileName}</strong>
                                <span>Document · {formatFileSize(att.fileSize)}</span>
                              </div>
                              <button
                                type="button"
                                className={styles.chatDownloadBtn}
                                onClick={() => void downloadAttachment(att)}
                              >
                                Download
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className={styles.chatBubbleFooter}>
                      <div className={styles.chatInlineActions}>
                        <button
                          type="button"
                          className={styles.chatActionPill}
                          onClick={() => {
                            setReplyTarget(item);
                            requestAnimationFrame(() => inputRef.current?.focus());
                          }}
                        >
                          Reply
                        </button>
                        {isOwn && (
                          <button
                            type="button"
                            className={styles.chatActionPill}
                            onClick={() => void openMessageInfo(item.id)}
                          >
                            Info
                          </button>
                        )}
                      </div>

                      <div className={styles.chatTimeAndTicks}>
                        <time dateTime={item.createdAt} title={formatFullTimestamp(item.createdAt)}>
                          {formatMessageTime(item.createdAt)}
                        </time>
                        {isOwn && (
                          <button
                            type="button"
                            className={styles.chatTickButton}
                            onClick={() => void openMessageInfo(item.id)}
                            title={
                              tickState === "seen"
                                ? `Seen by ${item.receiptSummary?.seenCount || 1} member(s)`
                                : tickState === "delivered"
                                  ? `Delivered to ${item.receiptSummary?.deliveredCount || 1} member(s)`
                                  : "Sent"
                            }
                            aria-label={`Message status: ${tickState}. Open message info.`}
                          >
                            <TickStatusSvg state={tickState} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>

        {showScrollBottom && (
          <button
            type="button"
            className={styles.chatScrollLatestBtn}
            onClick={() => {
              const container = messageListRef.current;
              if (container) {
                shouldAutoScrollRef.current = true;
                container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
              }
            }}
          >
            Jump to latest
          </button>
        )}
      </div>

      <form className={styles.chatComposerArea} onSubmit={handleSubmit}>
        {replyTarget && (
          <div className={styles.chatReplyBanner}>
            <div className={styles.chatReplyBannerText}>
              <strong>Replying to {replyTarget.author?.name || "Team member"}</strong>
              <span>{describeMessagePreview(replyTarget)}</span>
            </div>
            <button
              type="button"
              className={styles.chatActionPill}
              onClick={() => setReplyTarget(null)}
              aria-label="Cancel reply"
            >
              ×
            </button>
          </div>
        )}

        {pendingFiles.length > 0 && (
          <div className={styles.chatPendingFiles}>
            {pendingFiles.map((item) => (
              <div key={item.key} className={styles.chatPendingChip}>
                {item.previewUrl ? (
                  <img src={item.previewUrl} alt={item.file.name} className={styles.chatPendingThumb} />
                ) : (
                  <span>
                    {item.category === "video"
                      ? "🎬"
                      : item.category === "audio"
                        ? "🎙️"
                        : "📄"}
                  </span>
                )}
                <span className={styles.chatPendingName} title={item.file.name}>
                  {item.file.name}
                  {item.durationSeconds ? ` (${formatDuration(item.durationSeconds)})` : ""}
                </span>
                <button
                  type="button"
                  className={styles.chatActionPill}
                  onClick={() => removePendingFile(item.key)}
                  aria-label={`Remove ${item.file.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {isRecording && (
          <div className={styles.chatRecordingBar} role="status">
            <span className={styles.chatRecordDot} aria-hidden="true" />
            <strong style={{ fontSize: 13 }}>Recording voice message · {formatDuration(recordSeconds)}</strong>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button
                type="button"
                className={styles.chatToolBtn}
                onClick={cancelVoiceRecording}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.chatToolBtn}
                onClick={() => finishVoiceRecording(false)}
              >
                Attach
              </button>
              <button
                type="button"
                className={styles.chatSendBtn}
                style={{ height: 32, padding: "0 14px", fontSize: 12 }}
                onClick={() => finishVoiceRecording(true)}
              >
                Send Voice
              </button>
            </div>
          </div>
        )}

        <div className={styles.chatToolbarRow}>
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) addPendingFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) addPendingFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={documentInputRef}
            type="file"
            accept=".pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) addPendingFiles(event.target.files);
              event.target.value = "";
            }}
          />

          <button
            type="button"
            className={styles.chatToolBtn}
            onClick={() => imageInputRef.current?.click()}
            disabled={sending}
          >
            Image
          </button>
          <button
            type="button"
            className={styles.chatToolBtn}
            onClick={() => videoInputRef.current?.click()}
            disabled={sending}
          >
            Video
          </button>
          <button
            type="button"
            className={styles.chatToolBtn}
            onClick={() => documentInputRef.current?.click()}
            disabled={sending}
          >
            Document
          </button>
          <button
            type="button"
            className={`${styles.chatToolBtn} ${isRecording ? styles.isRecording : ""}`}
            onClick={() => (isRecording ? finishVoiceRecording(false) : void startVoiceRecording())}
            disabled={sending}
          >
            {isRecording ? "Stop Recording" : "Record Voice"}
          </button>
        </div>

        <div className={styles.chatInputRow}>
          <div className={styles.chatInputWrap}>
            {activeMention && filteredMembers.length > 0 && (
              <div id="chat-mention-listbox" role="listbox" aria-label="Team members" className={styles.chatMentionList}>
                {filteredMembers.map((member, index) => (
                  <button
                    key={member.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeMemberIndex}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectMember(member)}
                    className={`${styles.chatMentionOption} ${
                      index === activeMemberIndex ? styles.isActive : ""
                    }`}
                  >
                    <span>{member.name}</span>
                    {member.role && (
                      <span style={{ fontSize: 11, color: "var(--text-secondary)", textTransform: "capitalize" }}>
                        {member.role.replace("_", " ")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            <input
              ref={inputRef}
              role="combobox"
              className={styles.chatTextInput}
              value={draft}
              onChange={(event) => {
                const nextDraft = event.currentTarget.value;
                const caret = event.currentTarget.selectionStart ?? nextDraft.length;
                setDraft(nextDraft);
                setActiveMention(getActiveMention(nextDraft, caret));
                setActiveMemberIndex(0);
              }}
              onKeyDown={handleInputKeyDown}
              onPaste={handlePaste}
              maxLength={2000}
              placeholder="Write a message... (type @ to mention)"
              aria-label="Chat message"
              aria-autocomplete="list"
              aria-controls="chat-mention-listbox"
              aria-expanded={Boolean(activeMention && filteredMembers.length > 0)}
            />
          </div>
          <button
            type="submit"
            className={styles.chatSendBtn}
            disabled={sending || (!draft.trim() && pendingFiles.length === 0)}
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>

      {(infoLoading || infoModalData) && (
        <div
          className={styles.chatModalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Message Info"
          onClick={() => {
            setInfoModalData(null);
            setInfoLoading(false);
          }}
        >
          <div className={styles.chatInfoModal} onClick={(event) => event.stopPropagation()}>
            <div className={styles.chatInfoHeader}>
              <h2>Message Info</h2>
              <button
                type="button"
                className={styles.chatActionPill}
                onClick={() => {
                  setInfoModalData(null);
                  setInfoLoading(false);
                }}
                aria-label="Close message info"
              >
                ×
              </button>
            </div>
            <div className={styles.chatInfoBody}>
              {infoLoading && !infoModalData ? (
                <p style={{ color: "var(--text-secondary)", fontSize: 13 }}>Loading delivery and read details...</p>
              ) : (
                infoModalData && (
                  <>
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "var(--surface-primary)",
                        border: "1px solid var(--border-subtle)",
                      }}
                    >
                      <p style={{ margin: "0 0 4px", fontSize: 13 }}>
                        {describeMessagePreview(infoModalData.message)}
                      </p>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                        Sent {formatFullTimestamp(infoModalData.message.createdAt)}
                      </span>
                    </div>

                    <div className={styles.chatInfoSummaryStats}>
                      <div className={styles.chatInfoStatCard}>
                        <strong style={{ color: "#0284c7" }}>{infoModalData.seenBy.length}</strong>
                        <span>Seen</span>
                      </div>
                      <div className={styles.chatInfoStatCard}>
                        <strong>{infoModalData.deliveredTo.length}</strong>
                        <span>Delivered (Unseen)</span>
                      </div>
                      <div className={styles.chatInfoStatCard}>
                        <strong>{infoModalData.notDeliveredTo.length}</strong>
                        <span>Not Delivered</span>
                      </div>
                    </div>

                    <div className={styles.chatInfoSection}>
                      <h3>Seen by ({infoModalData.seenBy.length})</h3>
                      {infoModalData.seenBy.length === 0 ? (
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>No one has seen this message yet.</p>
                      ) : (
                        <div className={styles.chatInfoList}>
                          {infoModalData.seenBy.map((member) => (
                            <div key={member.id} className={styles.chatInfoRow}>
                              <div>
                                <strong>{member.name}</strong>
                                <span>{member.seenAt ? `Seen ${formatFullTimestamp(member.seenAt)}` : "Seen"}</span>
                              </div>
                              <TickStatusSvg state="seen" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={styles.chatInfoSection}>
                      <h3>Delivered to — not seen yet ({infoModalData.deliveredTo.length})</h3>
                      {infoModalData.deliveredTo.length === 0 ? (
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>No pending delivered recipients.</p>
                      ) : (
                        <div className={styles.chatInfoList}>
                          {infoModalData.deliveredTo.map((member) => (
                            <div key={member.id} className={styles.chatInfoRow}>
                              <div>
                                <strong>{member.name}</strong>
                                <span>{member.deliveredAt ? `Delivered ${formatFullTimestamp(member.deliveredAt)}` : "Delivered"}</span>
                              </div>
                              <TickStatusSvg state="delivered" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={styles.chatInfoSection}>
                      <h3>Not delivered yet ({infoModalData.notDeliveredTo.length})</h3>
                      {infoModalData.notDeliveredTo.length === 0 ? (
                        <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>Delivered to every active team member.</p>
                      ) : (
                        <div className={styles.chatInfoList}>
                          {infoModalData.notDeliveredTo.map((member) => (
                            <div key={member.id} className={styles.chatInfoRow}>
                              <div>
                                <strong>{member.name}</strong>
                                <span>Not delivered yet</span>
                              </div>
                              <TickStatusSvg state="sent" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {lightboxImage && (
        <div
          className={styles.chatModalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={lightboxImage.fileName}
          onClick={() => setLightboxImage(null)}
        >
          <div className={styles.chatLightboxCard} onClick={(event) => event.stopPropagation()}>
            <img
              src={getAttachmentUrl(lightboxImage.id, false)}
              alt={lightboxImage.fileName}
              className={styles.chatLightboxImg}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                className={styles.chatDownloadBtn}
                onClick={() => void downloadAttachment(lightboxImage)}
              >
                Download {lightboxImage.fileName}
              </button>
              <button
                type="button"
                className={styles.chatDownloadBtn}
                onClick={() => setLightboxImage(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
