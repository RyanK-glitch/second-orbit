"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { api } from "./api";

type Option = { value: string; label: string };

/** Note + decision buttons for a report or dispute. Every action is written to the audit log. */
export function ModerationActions({ endpoint, options, field, refundMax }: { endpoint: string; options: Option[]; field: "action" | "outcome"; refundMax?: number }) {
  const router = useRouter();
  const id = useId();
  const [note, setNote] = useState("");
  const [refund, setRefund] = useState(refundMax ? (refundMax / 100).toFixed(2) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(value: string) {
    setBusy(true);
    setError(null);
    const body: Record<string, unknown> = { [field]: value, note };
    if (value === "refund" && refund) body.refundCents = Math.round(Number.parseFloat(refund) * 100);
    const r = await api(endpoint, "POST", body);
    setBusy(false);
    if (r.ok) router.refresh();
    else setError(r.fieldErrors.note ?? r.error);
  }

  return (
    <div>
      <div className="field">
        <label htmlFor={`${id}-note`}>Decision note (shared with both parties for disputes)</label>
        <textarea className="textarea" id={`${id}-note`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} style={{ minHeight: 70 }} />
      </div>
      {refundMax != null && (
        <div className="field" style={{ maxWidth: 240 }}>
          <label htmlFor={`${id}-refund`}>Refund amount (USD)</label>
          <input className="input" id={`${id}-refund`} type="number" min="0.01" step="0.01" max={(refundMax / 100).toFixed(2)} value={refund} onChange={(e) => setRefund(e.target.value)} />
        </div>
      )}
      {error && <div className="alert alert-error" role="alert"><p>{error}</p></div>}
      <div className="actions-row">
        {options.map((o, i) => (
          <button key={o.value} type="button" className={`btn${i === 0 ? " btn-primary" : ""}`} disabled={busy} onClick={() => act(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
