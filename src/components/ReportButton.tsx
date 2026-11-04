"use client";

import { useId, useState } from "react";
import { REPORT_REASONS } from "@/lib/catalog";
import { api } from "./api";
import { Dialog } from "./Dialog";
import { FlagIcon } from "./icons";

export function ReportButton({ targetType, targetId, label }: { targetType: "listing" | "user" | "message"; targetId: string; label: string }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const id = useId();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const r = await api("/api/reports", "POST", { targetType, targetId, reason: fd.get("reason"), details: fd.get("details") });
    setBusy(false);
    if (r.ok) setStatus({ kind: "success", text: "Thanks. Our Trust & Safety team will review this report." });
    else if (r.status === 401) window.location.href = `/signin?next=${encodeURIComponent(location.pathname)}`;
    else setStatus({ kind: "error", text: r.error ?? "Couldn't send the report." });
  }

  return (
    <>
      <button type="button" className="link-btn" onClick={() => { setStatus(null); setOpen(true); }}>
        <FlagIcon /> {label}
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy={`${id}-title`}>
        <form onSubmit={submit}>
          <h2 id={`${id}-title`}>{label}</h2>
          {status ? (
            <div className={`alert alert-${status.kind}`} role="status"><p>{status.text}</p></div>
          ) : null}
          {status?.kind !== "success" && (
            <>
              <div className="field">
                <label htmlFor={`${id}-reason`}>Reason</label>
                <select className="select" id={`${id}-reason`} name="reason" required defaultValue="">
                  <option value="" disabled>Choose a reason</option>
                  {REPORT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`${id}-details`}>Details (optional)</label>
                <textarea className="textarea" id={`${id}-details`} name="details" maxLength={1000} />
              </div>
            </>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              {status?.kind === "success" ? "Close" : "Cancel"}
            </button>
            {status?.kind !== "success" && (
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? "Sending…" : "Send report"}
              </button>
            )}
          </div>
        </form>
      </Dialog>
    </>
  );
}
