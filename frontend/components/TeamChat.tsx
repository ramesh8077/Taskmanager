"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import API from "@/lib/axios";
import { useAuth } from "@/context/AuthContext";

type ChatMember = { id: number; name: string };
type ChatMessage = {
  id: number;
  userId: number;
  message: string;
  mentions: number[];
  createdAt: string;
  author: { id: number; name: string };
};
type ActiveMention = { start: number; end: number; query: string };

function mergeMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
  if (incoming.length === 0) return existing;
  const byId = new Map<number, ChatMessage>();
  for (const item of existing) byId.set(item.id, item);
  let changed = false;
  for (const item of incoming) {
    if (!item?.id) continue;
    if (!byId.has(item.id)) changed = true;
    byId.set(item.id, item);
  }
  if (!changed && existing.length === byId.size) return existing;
  return Array.from(byId.values())
    .sort((a, b) => a.id - b.id)
    .slice(-100);
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

export default function TeamChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [draft, setDraft] = useState("");
  const [activeMention, setActiveMention] = useState<ActiveMention | null>(null);
  const [activeMemberIndex, setActiveMemberIndex] = useState(0);
  const [error, setError] = useState("");
  const messageList = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const latestIdRef = useRef(0);
  const syncingRef = useRef(false);
  const shouldAutoScrollRef = useRef(true);
  const initialScrollDoneRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const [messageResponse, memberResponse] = await Promise.all([
        API.get<{ data: { messages: ChatMessage[] } }>("/chat/messages"),
        API.get<{ data: { members: ChatMember[] } }>("/chat/members"),
      ]);
      const loaded = mergeMessages([], messageResponse.data.data.messages || []);
      setMessages((items) => {
        const merged = mergeMessages(items, loaded);
        latestIdRef.current = merged.length ? merged[merged.length - 1].id : 0;
        return merged;
      });
      setMembers(memberResponse.data.data.members || []);
    } catch {
      setError("Chat ya team members load nahi ho paaye. Thodi der baad try karein.");
    }
  }, []);

  const syncNewMessages = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      const after = latestIdRef.current;
      const url = after > 0 ? `/chat/messages?after=${after}` : "/chat/messages";
      const response = await API.get<{ data: { messages: ChatMessage[] } }>(url);
      const incoming = response.data.data.messages || [];
      if (incoming.length > 0) {
        setMessages((items) => mergeMessages(items, incoming));
      }
    } catch {
      // Keep existing messages; next poll or socket event will retry.
    } finally {
      syncingRef.current = false;
    }
  }, []);

  useEffect(() => {
    latestIdRef.current = messages.length ? messages[messages.length - 1].id : 0;
  }, [messages]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let pollTimer: number | undefined;
    const schedulePolling = (connected: boolean) => {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      pollTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") void syncNewMessages();
      }, connected ? 10000 : 2000);
    };

    const receive = (event: Event) => {
      const message = (event as CustomEvent<ChatMessage>).detail;
      if (message?.id) {
        setMessages((items) => mergeMessages(items, [message]));
      }
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
      if (document.visibilityState === "visible") void syncNewMessages();
    };

    schedulePolling((window as Window & { __taskmanagerRealtimeOpen?: boolean }).__taskmanagerRealtimeOpen === true);
    window.addEventListener("taskmanager:chat-message", receive);
    window.addEventListener("taskmanager:notification", onNotification);
    window.addEventListener("taskmanager:realtime-status", onRealtimeStatus);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (pollTimer !== undefined) window.clearInterval(pollTimer);
      window.removeEventListener("taskmanager:chat-message", receive);
      window.removeEventListener("taskmanager:notification", onNotification);
      window.removeEventListener("taskmanager:realtime-status", onRealtimeStatus);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncNewMessages]);
  useEffect(() => {
    const container = messageList.current;
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
  }, [messages]);

  const filteredMembers = activeMention
    ? members.filter((member) => member.name.toLowerCase().includes(activeMention.query.trim().toLowerCase()))
    : [];

  const selectMember = (member: ChatMember) => {
    if (!activeMention) return;
    const before = draft.slice(0, activeMention.start);
    const after = draft.slice(activeMention.end);
    const nextDraft = `${before}@${member.name} ${after}`;
    const nextCaret = before.length + member.name.length + 2;
    setDraft(nextDraft);
    setActiveMention(null);
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(nextCaret, nextCaret);
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

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    setError("");
    try {
      const response = await API.post<{ data: { message: ChatMessage } }>("/chat/messages", { message });
      const created = response.data.data.message;
      shouldAutoScrollRef.current = true;
      setMessages((items) => mergeMessages(items, [created]));
      setDraft("");
      setActiveMention(null);
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || "Message send nahi hua.");
    }
  };

  return <section style={{ maxWidth: 900, margin: "24px auto", padding: 24, width: "100%", background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 16 }}>
    <header style={{ marginBottom: 18 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>Team chat</h1>
      <p style={{ color: "var(--text-secondary)" }}>Sabhi active team members ke saath baat karein. @ type karke kisi member ko mention karein.</p>
    </header>
    <div
      ref={messageList}
      onScroll={() => {
        const container = messageList.current;
        if (container) {
          shouldAutoScrollRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 140;
        }
      }}
      aria-live="polite"
      style={{ height: "min(60vh, 620px)", overflowY: "auto", display: "flex", flexDirection: "column", padding: 14, background: "var(--surface-primary)", borderRadius: 12 }}
    >
      {messages.length ? <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((item) => <article key={item.id} style={{ alignSelf: item.userId === user?.id ? "flex-end" : "flex-start", maxWidth: "85%", padding: "10px 14px", borderRadius: 12, background: item.userId === user?.id ? "var(--accent)" : "var(--surface-card)", color: item.userId === user?.id ? "white" : "var(--text-primary)" }}>
          <strong style={{ fontSize: 12, display: "block", marginBottom: 3 }}>{item.author?.name || "Team member"}</strong>
          <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.message}</p>
          <time style={{ opacity: .7, fontSize: 11 }}>{new Date(item.createdAt).toLocaleString()}</time>
        </article>)}
      </div> : <p style={{ margin: "auto", color: "var(--text-secondary)" }}>Abhi chat khaali hai. Pehla message bhejein.</p>}
    </div>
    <form onSubmit={send} style={{ display: "flex", gap: 10, marginTop: 14 }}>
      <div style={{ position: "relative", flex: 1, minWidth: 0 }}>
        {activeMention && <div role="listbox" aria-label="Team members" style={{ position: "absolute", zIndex: 2, left: 0, right: 0, bottom: "calc(100% + 8px)", maxHeight: 240, overflowY: "auto", padding: 4, border: "1px solid var(--border-subtle)", borderRadius: 10, background: "var(--surface-card)", boxShadow: "0 8px 24px rgba(0,0,0,.16)" }}>
          {filteredMembers.length ? filteredMembers.map((member, index) => <button
            key={member.id}
            type="button"
            role="option"
            aria-selected={index === activeMemberIndex}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectMember(member)}
            style={{ display: "block", width: "100%", padding: "9px 10px", border: 0, borderRadius: 7, textAlign: "left", color: "var(--text-primary)", background: index === activeMemberIndex ? "var(--surface-primary)" : "transparent", cursor: "pointer" }}
          >{member.name}</button>) : <p style={{ padding: "9px 10px", color: "var(--text-secondary)" }}>Koi member nahi mila.</p>}
        </div>}
        <input
          ref={input}
          value={draft}
          onChange={(event) => {
            const nextDraft = event.currentTarget.value;
            const caret = event.currentTarget.selectionStart ?? nextDraft.length;
            setDraft(nextDraft);
            setActiveMention(getActiveMention(nextDraft, caret));
            setActiveMemberIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          maxLength={2000}
          placeholder="Message likhein... @ type karein"
          aria-label="Chat message"
          aria-autocomplete="list"
          aria-expanded={Boolean(activeMention)}
          style={{ width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 10, border: "1px solid var(--border-subtle)", background: "var(--surface-primary)", color: "var(--text-primary)" }}
        />
      </div>
      <button type="submit" disabled={!draft.trim()} style={{ padding: "0 20px", borderRadius: 10, color: "white", background: "var(--accent)", opacity: draft.trim() ? 1 : .5 }}>Send</button>
    </form>
    {error && <p role="alert" style={{ color: "#dc2626", marginTop: 8 }}>{error}</p>}
  </section>;
}
