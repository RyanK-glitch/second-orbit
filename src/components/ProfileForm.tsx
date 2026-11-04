"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Address } from "@/lib/integrations/types";
import { api } from "./api";

type Props = { displayName: string; location: string; bio: string; shipFrom: Address | null };

export function ProfileForm(p: Props) {
  const router = useRouter();
  const [hasAddress, setHasAddress] = useState(!!p.shipFrom);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? "");
    setBusy(true);
    const r = await api("/api/account/profile", "PATCH", {
      displayName: s("displayName"),
      location: s("location"),
      bio: s("bio"),
      shipFrom: hasAddress
        ? { name: s("sf.name"), line1: s("sf.line1"), line2: s("sf.line2"), city: s("sf.city"), state: s("sf.state"), postalCode: s("sf.postalCode"), country: "US" }
        : null,
    });
    setBusy(false);
    setErrors(r.fieldErrors);
    setStatus(r.ok ? { kind: "success", text: "Saved." } : { kind: "error", text: r.error ?? "Couldn't save." });
    if (r.ok) router.refresh();
  }

  const input = (name: string, label: string, value = "", opts: { auto?: string; max?: number; hint?: string } = {}) => {
    const key = name.replace("sf.", "shipFrom.");
    return (
      <div className="field">
        <label htmlFor={name}>{label}</label>
        <input className="input" id={name} name={name} defaultValue={value} maxLength={opts.max ?? 120} autoComplete={opts.auto}
          aria-invalid={errors[key] ? true : undefined} aria-describedby={`${name}-err`} />
        {opts.hint && <p className="hint">{opts.hint}</p>}
        <p className="error" id={`${name}-err`}>{errors[key]}</p>
      </div>
    );
  };

  return (
    <form onSubmit={submit} noValidate>
      {status && <div className={`alert alert-${status.kind}`} role="status"><p>{status.text}</p></div>}
      <div className="row">
        {input("displayName", "Display name", p.displayName, { max: 60, auto: "nickname" })}
        {input("location", "Area (shown on listings)", p.location, { max: 80, hint: "City and state is plenty. Never your street." })}
      </div>
      <div className="field">
        <label htmlFor="bio">About you</label>
        <textarea className="textarea" id="bio" name="bio" defaultValue={p.bio} maxLength={500} />
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: "8px 0 0" }}>
        <legend className="label" style={{ fontWeight: 600, marginBottom: 6 }}>Ship-from address (private)</legend>
        <p className="hint">Only used to buy shipping labels. Buyers never see it.</p>
        <label className="check"><input type="checkbox" checked={hasAddress} onChange={(e) => setHasAddress(e.target.checked)} /> I ship items</label>
        {hasAddress && (
          <>
            {input("sf.name", "Sender name", p.shipFrom?.name, { auto: "name" })}
            {input("sf.line1", "Street address", p.shipFrom?.line1, { auto: "address-line1" })}
            {input("sf.line2", "Apt, suite (optional)", p.shipFrom?.line2, { auto: "address-line2" })}
            <div className="row-3">
              {input("sf.city", "City", p.shipFrom?.city, { auto: "address-level2" })}
              {input("sf.state", "State", p.shipFrom?.state, { auto: "address-level1", max: 40 })}
              {input("sf.postalCode", "ZIP code", p.shipFrom?.postalCode, { auto: "postal-code", max: 10 })}
            </div>
          </>
        )}
      </fieldset>
      <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
    </form>
  );
}
