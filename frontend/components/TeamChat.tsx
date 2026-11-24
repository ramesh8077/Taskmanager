"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import API from "@/lib/axios";
import { useAuth } from "@/context/AuthContext";

type ChatMessage = { id: number; userId: number; message: string; mentions: number[]; createdAt: string; author: { id: number; name: string } };

export default function TeamChat() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await API.get<{ data: { messages: ChatMessage[] } }>("/chat/messages");
      setMessages(response.data.data.messages || []);
    } catch { setError("Chat load nahi ho payi. Thodi der baad try karein."); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const receive = (event: Event) => {
      const message = (event as CustomEvent<ChatMessage>).detail;
      if (message?.id) setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message].slice(-100));
    };
    window.addEventListener("taskmanager:chat-message", receive);
    return () => window.removeEventListener("taskmanager:chat-message", receive);
  }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    setError("");
    try {
      const response = await API.post<{ data: { message: ChatMessage } }>("/chat/messages", { message });
      const created = response.data.data.message;
      setMessages((items) => items.some((item) => item.id === created.id) ? items : [...items, created].slice(-100));
      setDraft("");
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || "Message send nahi hua.");
    }
  };

  return <section style={{ maxWidth: 900, margin: "24px auto", padding: 24, width: "100%", background: "var(--surface-card)", border: "1px solid var(--border-subtle)", borderRadius: 16 }}>
    <header style={{ marginBottom: 18 }}><h1 style={{ fontSize: 24, fontWeight: 700 }}>Team chat</h1><p style={{ color: "var(--text-secondary)" }}>Sabhi active team members ke saath baat karein. Kisi ko notify karne ke liye @ ke baad unka poora naam likhein.</p></header>
    <div aria-live="polite" style={{ height: "min(60vh, 620px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, padding: 14, background: "var(--surface-primary)", borderRadius: 12 }}>
      {messages.length ? messages.map((item) => <article key={item.id} style={{ alignSelf: item.userId === user?.id ? "flex-end" : "flex-start", maxWidth: "85%", padding: "10px 14px", borderRadius: 12, background: item.userId === user?.id ? "var(--accent)" : "var(--surface-card)", color: item.userId === user?.id ? "white" : "var(--text-primary)" }}>
        <strong style={{ fontSize: 12, display: "block", marginBottom: 3 }}>{item.author?.name || "Team member"}</strong><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{item.message}</p><time style={{ opacity: .7, fontSize: 11 }}>{new Date(item.createdAt).toLocaleString()}</time>
      </article>) : <p style={{ margin: "auto", color: "var(--text-secondary)" }}>Abhi chat khaali hai. Pehla message bhejein.</p>}
      <div ref={bottom} />
    </div>
    <form onSubmit={send} style={{ display: "flex", gap: 10, marginTop: 14 }}>
      <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Message likhein... @Name se mention karein" aria-label="Chat message" style={{ flex: 1, minWidth: 0, padding: 12, borderRadius: 10, border: "1px solid var(--border-subtle)", background: "var(--surface-primary)", color: "var(--text-primary)" }} />
      <button type="submit" disabled={!draft.trim()} style={{ padding: "0 20px", borderRadius: 10, color: "white", background: "var(--accent)", opacity: draft.trim() ? 1 : .5 }}>Send</button>
    </form>
    {error && <p role="alert" style={{ color: "#dc2626", marginTop: 8 }}>{error}</p>}
  </section>;
}
