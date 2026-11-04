"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { DISPUTE_REASONS } from "@/lib/catalog";
import { api } from "./api";

/** Generic JSON form posting to an order action, with inline field errors. */
function useOrderAction(orderId: string, action: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  async function run(body: unknown) {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const r = await api(`/api/orders/${orderId}/${action}`, "POST", body);
    setBusy(false);
    if (r.ok) {
      router.refresh();
      return true;
    }
    setError(r.error);
    setFieldErrors(r.fieldErrors);
    return false;
  }
  return { busy, error, fieldErrors, run };
}

const Err = ({ id, text }: { id: string; text?: string }) => <p className="error" id={id}>{text}</p>;

export function ReviewForm({ orderId, sellerName }: { orderId: string; sellerName: string }) {
  const { busy, error, fieldErrors, run } = useOrderAction(orderId, "review");
  const id = useId();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run({ rating: Number(fd.get("rating") ?? 0), body: fd.get("body") ?? "" });
      }}
    >
      <h2 id={`${id}-t`}>Review {sellerName}</h2>
      {error && <div className="alert alert-error" role="alert"><p>{error}</p></div>}
      <fieldset className="stars-input" aria-describedby={`${id}-rating-err`}>
        <legend className="label" style={{ width: "100%", marginBottom: 6 }}>Rating</legend>
        {[5, 4, 3, 2, 1].map((n) => (
          <label key={n}>
            <input type="radio" name="rating" value={n} required />
            <span aria-hidden="true">{"★".repeat(n)}</span>
            <span className="visually-hidden">{n} star{n > 1 ? "s" : ""}</span>
          </label>
        ))}
      </fieldset>
      <Err id={`${id}-rating-err`} text={fieldErrors.rating} />
      <div className="field">
        <label htmlFor={`${id}-body`}>What was it like? (optional)</label>
        <textarea className="textarea" id={`${id}-body`} name="body" maxLength={1000} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Posting…" : "Post review"}</button>
    </form>
  );
}

export function DisputeForm({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const { busy, error, fieldErrors, run } = useOrderAction(orderId, "dispute");
  const id = useId();
  if (!open) {
    return <button type="button" className="btn" onClick={() => setOpen(true)}>Report a problem</button>;
  }
  return (
    <form
      className="panel glass"
      style={{ marginTop: 12 }}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run({ reason: fd.get("reason"), details: fd.get("details") });
      }}
    >
      <h2>Open a dispute</h2>
      <p className="hint">Your payment stays on hold while our team reviews the case. Add photos or details in Messages if you have them.</p>
      {error && <div className="alert alert-error" role="alert"><p>{error}</p></div>}
      <div className="field">
        <label htmlFor={`${id}-reason`}>What went wrong?</label>
        <select className="select" id={`${id}-reason`} name="reason" defaultValue="" aria-describedby={`${id}-reason-err`} aria-invalid={fieldErrors.reason ? true : undefined}>
          <option value="" disabled>Choose a reason</option>
          {DISPUTE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <Err id={`${id}-reason-err`} text={fieldErrors.reason} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-details`}>Describe the problem</label>
        <textarea className="textarea" id={`${id}-details`} name="details" maxLength={2000} aria-describedby={`${id}-details-err`} aria-invalid={fieldErrors.details ? true : undefined} />
        <Err id={`${id}-details-err`} text={fieldErrors.details} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Submitting…" : "Submit dispute"}</button>
      </div>
    </form>
  );
}

export function DisputeResponseForm({ orderId }: { orderId: string }) {
  const { busy, error, fieldErrors, run } = useOrderAction(orderId, "dispute-response");
  const id = useId();
  return (
    <form onSubmit={(e) => { e.preventDefault(); run({ response: new FormData(e.currentTarget).get("response") }); }}>
      {error && <div className="alert alert-error" role="alert"><p>{error}</p></div>}
      <div className="field">
        <label htmlFor={`${id}-r`}>Your response to the buyer&apos;s dispute</label>
        <textarea className="textarea" id={`${id}-r`} name="response" maxLength={2000} aria-describedby={`${id}-r-err`} />
        <Err id={`${id}-r-err`} text={fieldErrors.response} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>Send response</button>
    </form>
  );
}

export function PickupForm({ orderId }: { orderId: string }) {
  const { busy, error, fieldErrors, run } = useOrderAction(orderId, "pickup");
  const id = useId();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const local = String(fd.get("startsAt") ?? "");
        // datetime-local has no timezone: convert using the browser's zone.
        run({ op: "propose", startsAt: local ? new Date(local).toISOString() : "", location: fd.get("location"), note: fd.get("note") ?? "" });
      }}
    >
      <h3 style={{ marginTop: 12 }}>Propose a pickup time</h3>
      {error && <div className="alert alert-error" role="alert"><p>{error}</p></div>}
      <div className="row">
        <div className="field">
          <label htmlFor={`${id}-when`}>Date and time</label>
          <input className="input" type="datetime-local" id={`${id}-when`} name="startsAt" required aria-describedby={`${id}-when-err`} />
          <Err id={`${id}-when-err`} text={fieldErrors.startsAt} />
        </div>
        <div className="field">
          <label htmlFor={`${id}-where`}>Public meeting place</label>
          <input className="input" id={`${id}-where`} name="location" required maxLength={160} placeholder="e.g. Library entrance, Main St" aria-describedby={`${id}-where-err`} />
          <Err id={`${id}-where-err`} text={fieldErrors.location} />
        </div>
      </div>
      <div className="field">
        <label htmlFor={`${id}-note`}>Note (optional)</label>
        <input className="input" id={`${id}-note`} name="note" maxLength={500} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={busy}>Propose time</button>
    </form>
  );
}
