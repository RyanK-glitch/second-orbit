"use client";

import { useEffect, useRef, useState } from "react";
import { looksLikeOffPlatformPayment } from "@/lib/sanitize";
import { api } from "./api";
import { ReportButton } from "./ReportButton";

type Msg = { id: string; sender_id: string; body: string; created_at: string };

/** Conversation view. Polls every 5s (simple and robust; swap for SSE/websockets at scale). */
export function MessageThread({ conversationId, meId, initial, otherName }: { conversationId: string; meId: string; initial: Msg[]; otherName: string }) {
  const [messages, setMessages] = useState<Msg[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden) return;
      const r = await api<{ messages: Msg[] }>(`/api/conversations/${conversationId}/messages`, "GET");
      if (r.ok && r.data) setMessages(r.data.messages);
    }, 5000);
    return () => clearInterval(t);
  }, [conversationId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get("body") ?? "");
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    const r = await api<Msg>(`/api/conversations/${conversationId}/messages`, "POST", { body });
    setBusy(false);
    if (r.ok && r.data) {
      setMessages((m) => [...m, r.data!]);
      form.reset();
    } else setError(r.fieldErrors.body ?? r.error);
  }

  const warn = messages.some((m) => m.sender_id !== meId && looksLikeOffPlatformPayment(m.body));
  return (
    <>
      {warn && (
        <div className="alert alert-warn" role="note">
          <p><strong>Safety tip:</strong> {otherName} mentioned paying outside the platform. Off-platform payments aren&apos;t covered by escrow buyer protection. Never send money by gift card, wire or payment apps.</p>
        </div>
      )}
      <div className="chat glass" style={{ padding: 16 }} ref={listRef} role="log" aria-live="polite" aria-label={`Conversation with ${otherName}`}>
        {messages.length === 0 && <p className="hint">No messages yet.</p>}
        {messages.map((m) => {
          const mine = m.sender_id === meId;
          return (
            <div key={m.id} className={`bubble${mine ? " mine" : ""}`}>
              <span className="visually-hidden">{mine ? "You" : otherName}: </span>
              {m.body}
              <time dateTime={new Date(m.created_at).toISOString()}>
                {new Date(m.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </time>
              {!mine && <ReportButton targetType="message" targetId={m.id} label="Report message" />}
            </div>
          );
        })}
      </div>
      <form className="chat-form" onSubmit={send} ref={formRef}>
        <div className="field" style={{ flex: 1, marginBottom: 0 }}>
          <label htmlFor="msg-body" className="visually-hidden">Message {otherName}</label>
          <textarea
            className="textarea"
            id="msg-body"
            name="body"
            maxLength={2000}
            required
            placeholder={`Message ${otherName}…`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                formRef.current?.requestSubmit();
              }
            }}
          />
        </div>
        <button className="btn btn-primary" type="submit" disabled={busy}>Send</button>
      </form>
      <p className="hint" style={{ marginTop: 6 }}>Enter to send · Shift+Enter for a new line</p>
      {error && <div className="alert alert-error" role="alert"><p>{error}</p></div>}
    </>
  );
}
