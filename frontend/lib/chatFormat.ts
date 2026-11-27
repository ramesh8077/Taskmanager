export type ChatMember = {
  id: number;
  name: string;
  role?: string;
};

export type ChatAttachmentItem = {
  id: number;
  messageId: number;
  uploadedBy: number;
  category: "image" | "video" | "audio" | "document";
  fileName: string;
  mimeType: string;
  fileSize: number;
  durationSeconds?: number | null;
  createdAt?: string;
};

export type ChatReplyReference = {
  id: number;
  userId: number;
  message: string;
  messageType?: string;
  deletedForEveryoneAt?: string | null;
  createdAt: string;
  author: { id: number; name: string };
  attachments?: Array<{ id: number; category: string; fileName: string; mimeType: string }>;
};

export type ChatReceiptSummary = {
  totalRecipients: number;
  deliveredCount: number;
  seenCount: number;
  tickState: "sent" | "delivered" | "seen";
};

export const DELETE_EVERYONE_WINDOW_MS = 6 * 60 * 60 * 1000;
export const EDIT_MESSAGE_WINDOW_MS = 3 * 60 * 60 * 1000;

export type ChatMessageItem = {
  id: number;
  userId: number;
  replyToId?: number | null;
  messageType?: string;
  message: string;
  mentions: number[];
  editedAt?: string | null;
  deletedForEveryoneAt?: string | null;
  deletedById?: number | null;
  createdAt: string;
  author: { id: number; name: string; role?: string };
  attachments?: ChatAttachmentItem[];
  replyTo?: ChatReplyReference | null;
  receiptSummary?: ChatReceiptSummary;
};

export function isWithinMessageWindow(createdAt: string, windowMs: number, nowMs: number): boolean {
  const createdMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdMs)) return false;
  return nowMs - createdMs <= windowMs;
}

export function getDateKey(dateValue: string | Date): string {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "unknown";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDateDividerLabel(dateValue: string | Date, referenceNow: Date = new Date()): string {
  const target = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(target.getTime())) return "";

  const targetKey = getDateKey(target);
  const todayKey = getDateKey(referenceNow);
  if (targetKey === todayKey) return "Today";

  const yesterday = new Date(referenceNow);
  yesterday.setDate(yesterday.getDate() - 1);
  if (targetKey === getDateKey(yesterday)) return "Yesterday";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(target);
}

export function formatMessageTime(dateValue: string | Date): string {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatFullTimestamp(dateValue: string | Date): string {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function sortAndMergeMessages(
  existing: ChatMessageItem[],
  incoming: ChatMessageItem[]
): ChatMessageItem[] {
  if (incoming.length === 0) return existing;
  const byId = new Map<number, ChatMessageItem>();
  for (const item of existing) {
    if (item?.id) byId.set(item.id, item);
  }
  for (const item of incoming) {
    if (!item?.id) continue;
    const prev = byId.get(item.id);
    byId.set(item.id, prev ? { ...prev, ...item } : item);
  }
  return Array.from(byId.values()).sort((a, b) => {
    const tA = new Date(a.createdAt).getTime();
    const tB = new Date(b.createdAt).getTime();
    if (Number.isFinite(tA) && Number.isFinite(tB) && tA !== tB) {
      return tA - tB;
    }
    return a.id - b.id;
  });
}

export function isMessageDeleted(item: {
  messageType?: string;
  deletedForEveryoneAt?: string | null;
}): boolean {
  return Boolean(item.deletedForEveryoneAt) || item.messageType === "deleted";
}

export function describeMessagePreview(item: {
  message?: string;
  messageType?: string;
  deletedForEveryoneAt?: string | null;
  attachments?: Array<{ category: string; fileName?: string }>;
}): string {
  if (isMessageDeleted(item)) return "This message was deleted";
  if (item.message?.trim()) return item.message.trim();
  const attachments = item.attachments || [];
  if (attachments.length > 0) {
    const first = attachments[0];
    if (first.category === "audio") return "Voice message";
    if (first.category === "image") return attachments.length > 1 ? `${attachments.length} images` : "Photo";
    if (first.category === "video") return attachments.length > 1 ? `${attachments.length} videos` : "Video";
    return first.fileName || "Document";
  }
  if (item.messageType === "audio") return "Voice message";
  if (item.messageType === "image") return "Photo";
  if (item.messageType === "video") return "Video";
  if (item.messageType === "document") return "Document";
  return "Message";
}
