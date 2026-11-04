"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { CONDITIONS, GRADES } from "@/lib/catalog";
import { computeFees, formatCents } from "@/lib/money";
import { api } from "./api";
import { UploadIcon } from "./icons";

type Issue = { code: string; severity: "error" | "warning"; message: string };
type Report = { ok: boolean; issues: Issue[]; metrics?: Record<string, number> };
type Photo = { id: string; kind: "photo" | "wear_closeup"; thumbUrl: string; report?: Report };
type Rejected = { key: string; name: string; message: string; issues: Issue[] };

export type SellInitial = {
  title: string;
  categoryId: string;
  brand: string;
  condition: string;
  price: string;
  originalPrice: string;
  originalNote: string;
  shipping: string;
  pickupOnly: boolean;
  description: string;
  wearNotes: string;
  specs: { key: string; value: string }[];
  images: Photo[];
};

const EMPTY: SellInitial = {
  title: "", categoryId: "", brand: "", condition: "", price: "", originalPrice: "", originalNote: "",
  shipping: "0", pickupOnly: false, description: "", wearNotes: "", specs: [{ key: "", value: "" }], images: [],
};

const toCents = (v: string) => {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

export function SellForm({ categories, listingId, initial = EMPTY }: { categories: { id: string; name: string }[]; listingId?: string; initial?: SellInitial }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [photos, setPhotos] = useState<Photo[]>(initial.images);
  const [rejected, setRejected] = useState<Rejected[]>([]);
  const [uploading, setUploading] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState("");

  const set = <K extends keyof SellInitial>(k: K, val: SellInitial[K]) => setV((s) => ({ ...s, [k]: val }));
  const priceCents = toCents(v.price);
  const fees = useMemo(() => computeFees(Number.isFinite(priceCents) ? priceCents : 0, 0), [priceCents]);
  const hasCloseup = photos.some((p) => p.kind === "wear_closeup");

  async function upload(files: FileList | null, kind: Photo["kind"]) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, Math.max(0, 8 - photos.length));
    setUploading((n) => n + list.length);
    for (const file of list) {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      const r = await api<Photo & { report: Report }>("/api/uploads", "POST", fd);
      setUploading((n) => n - 1);
      if (r.ok && r.data) {
        const photo = r.data;
        setPhotos((p) => [...p, photo]);
        const warns = photo.report.issues.length;
        setAnnounce(`${file.name} uploaded${warns ? ` with ${warns} suggestion${warns > 1 ? "s" : ""}` : " and passed the quality check"}.`);
      } else {
        const report = (r.details?.report as Report | undefined) ?? null;
        setRejected((x) => [...x, { key: `${file.name}-${Date.now()}`, name: file.name, message: r.error ?? "Upload failed.", issues: report?.issues ?? [] }]);
        setAnnounce(`${file.name} was not added: ${r.error}`);
      }
    }
  }

  async function removePhoto(p: Photo) {
    setPhotos((list) => list.filter((x) => x.id !== p.id));
    // Unpublished uploads are deleted now; photos already on the listing are detached on save.
    if (!listingId || !initial.images.some((i) => i.id === p.id)) await api(`/api/uploads/${p.id}`, "DELETE");
    setAnnounce("Photo removed.");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    setFormError(null);
    const specs = Object.fromEntries(v.specs.filter((s) => s.key.trim() && s.value.trim()).map((s) => [s.key, s.value]));
    const payload = {
      title: v.title,
      categoryId: v.categoryId,
      brand: v.brand,
      condition: v.condition || undefined,
      priceCents: toCents(v.price) || 0,
      originalPriceCents: toCents(v.originalPrice) || 0,
      originalNote: v.originalNote,
      shippingCents: v.pickupOnly ? 0 : toCents(v.shipping) || 0,
      pickupOnly: v.pickupOnly,
      description: v.description,
      wearNotes: v.wearNotes,
      specs,
      images: photos.map((p) => ({ id: p.id, kind: p.kind })),
    };
    const r = await api<{ id: string }>(listingId ? `/api/listings/${listingId}` : "/api/listings", listingId ? "PATCH" : "POST", payload);
    setBusy(false);
    if (r.ok && r.data) {
      router.push(`/listings/${r.data.id}`);
      router.refresh();
      return;
    }
    setFormError(r.error);
    setErrors(r.fieldErrors);
    requestAnimationFrame(() => document.getElementById("sell-errors")?.focus());
  }

  const err = (k: string) => errors[k];
  const fieldProps = (k: string) => ({
    "aria-invalid": err(k) ? (true as const) : undefined,
    "aria-describedby": `${k}-err ${k}-hint`,
  });
  const ErrorText = ({ k }: { k: string }) => <p className="error" id={`${k}-err`}>{err(k)}</p>;
  const LABELS: Record<string, string> = {
    title: "Title", categoryId: "Category", condition: "Condition", priceCents: "Asking price", originalPriceCents: "Original price",
    description: "Description", wearNotes: "Wear and defects", images: "Photos", shippingCents: "Shipping",
  };

  return (
    <form className="sell-form glass" onSubmit={submit} noValidate>
      {(formError || Object.keys(errors).length > 0) && (
        <div className="alert alert-error" id="sell-errors" tabIndex={-1} role="alert">
          <p><strong>{formError ?? "Please fix the following:"}</strong></p>
          {Object.keys(errors).length > 0 && (
            <ul style={{ margin: "6px 0 0", paddingLeft: "1.2em" }}>
              {Object.entries(errors).map(([k, m]) => (
                <li key={k}><a href={`#${k === "images" ? "photos-title" : k}`}>{LABELS[k] ?? k}: {m}</a></li>
              ))}
            </ul>
          )}
        </div>
      )}

      <h2>The item</h2>
      <div className="field">
        <label htmlFor="title">Title <span className="req" aria-hidden="true">*</span></label>
        <input className="input" id="title" value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={120} placeholder="e.g. Sony WH-1000XM4 headphones, black" required {...fieldProps("title")} />
        <p className="hint" id="title-hint">Include brand, model, size or colour.</p>
        <ErrorText k="title" />
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="categoryId">Category <span className="req" aria-hidden="true">*</span></label>
          <select className="select" id="categoryId" value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)} required {...fieldProps("categoryId")}>
            <option value="">Choose a category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span id="categoryId-hint" hidden />
          <ErrorText k="categoryId" />
        </div>
        <div className="field">
          <label htmlFor="brand">Brand or maker</label>
          <input className="input" id="brand" value={v.brand} onChange={(e) => set("brand", e.target.value)} maxLength={60} placeholder="Optional" />
        </div>
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0 }} aria-describedby="condition-err">
        <legend className="label" style={{ marginBottom: 6 }} id="condition">Condition <span className="req" aria-hidden="true">*</span></legend>
        <div className="option-cards cols-4">
          {CONDITIONS.map((g) => (
            <label className="option-card" key={g}>
              <input type="radio" name="condition" value={g} checked={v.condition === g} onChange={() => set("condition", g)} />
              <span className="oc-body"><strong>{GRADES[g].label}</strong><small>{GRADES[g].summary}</small></span>
            </label>
          ))}
        </div>
        <ErrorText k="condition" />
      </fieldset>

      <h2>Pricing</h2>
      <div className="row">
        <div className="field">
          <label htmlFor="originalPriceCents">Original price when new <span className="req" aria-hidden="true">*</span></label>
          <div className="input-prefix"><span aria-hidden="true">$</span>
            <input className="input" id="originalPriceCents" type="number" min="1" step="0.01" inputMode="decimal" value={v.originalPrice} onChange={(e) => set("originalPrice", e.target.value)} {...fieldProps("originalPriceCents")} />
          </div>
          <p className="hint" id="originalPriceCents-hint">Shown crossed out so buyers can see the saving.</p>
          <ErrorText k="originalPriceCents" />
        </div>
        <div className="field">
          <label htmlFor="priceCents">Your asking price <span className="req" aria-hidden="true">*</span></label>
          <div className="input-prefix"><span aria-hidden="true">$</span>
            <input className="input" id="priceCents" type="number" min="1" step="0.01" inputMode="decimal" value={v.price} onChange={(e) => set("price", e.target.value)} {...fieldProps("priceCents")} />
          </div>
          <span id="priceCents-hint" hidden />
          <ErrorText k="priceCents" />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label htmlFor="shippingCents">Shipping cost to buyer</label>
          <div className="input-prefix"><span aria-hidden="true">$</span>
            <input className="input" id="shippingCents" type="number" min="0" step="0.01" inputMode="decimal" value={v.shipping} disabled={v.pickupOnly} onChange={(e) => set("shipping", e.target.value)} {...fieldProps("shippingCents")} />
          </div>
          <p className="hint" id="shippingCents-hint">Enter 0 for free shipping. You&apos;ll buy a discounted label when it sells.</p>
          <ErrorText k="shippingCents" />
        </div>
        <div className="field">
          <span className="label">Delivery</span>
          <label className="check" style={{ minHeight: 44 }}>
            <input type="checkbox" checked={v.pickupOnly} onChange={(e) => set("pickupOnly", e.target.checked)} /> Local pickup only
          </label>
        </div>
      </div>
      <div className="payout" aria-live="polite">
        <dl>
          <dt>Asking price</dt><dd>{formatCents(fees.itemsCents, true)}</dd>
          <dt>Marketplace fee</dt><dd>−{formatCents(fees.platformFeeCents, true)}</dd>
          <dt className="payout-total">You&apos;ll receive (plus shipping)</dt><dd className="payout-total">{formatCents(Math.max(0, fees.sellerPayoutCents), true)}</dd>
        </dl>
        <p style={{ margin: "8px 0 0", color: "var(--text-muted)" }}>Paid out after the buyer confirms delivery, or automatically when the inspection window ends.</p>
      </div>

      <h2>Condition details</h2>
      <div className="field">
        <label htmlFor="description">Description <span className="req" aria-hidden="true">*</span></label>
        <textarea className="textarea" id="description" value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} {...fieldProps("description")} />
        <p className="hint" id="description-hint">What it is, how you used it, what&apos;s included, and why you&apos;re selling.</p>
        <ErrorText k="description" />
      </div>
      <div className="field">
        <label htmlFor="wearNotes">Wear and defects <span className="req" aria-hidden="true">*</span></label>
        <textarea className="textarea" id="wearNotes" value={v.wearNotes} onChange={(e) => set("wearNotes", e.target.value)} maxLength={2000} placeholder={"One per line, e.g.\nSmall scratch on the back\nBattery health 87%"} {...fieldProps("wearNotes")} />
        <p className="hint" id="wearNotes-hint">List each scratch, mark or fault on its own line. If there are none, write &quot;No visible wear&quot;.</p>
        <ErrorText k="wearNotes" />
      </div>
      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend className="label" style={{ marginBottom: 6 }}>Item details (optional)</legend>
        {v.specs.map((s, i) => (
          <div className="row" key={i}>
            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor={`spec-k-${i}`} className="visually-hidden">Detail name {i + 1}</label>
              <input className="input" id={`spec-k-${i}`} placeholder="e.g. Size" value={s.key} maxLength={40}
                onChange={(e) => set("specs", v.specs.map((x, k) => (k === i ? { ...x, key: e.target.value } : x)))} />
            </div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label htmlFor={`spec-v-${i}`} className="visually-hidden">Detail value {i + 1}</label>
              <input className="input" id={`spec-v-${i}`} placeholder="e.g. Medium" value={s.value} maxLength={120}
                onChange={(e) => set("specs", v.specs.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} />
            </div>
          </div>
        ))}
        {v.specs.length < 12 && (
          <button type="button" className="link-btn" onClick={() => set("specs", [...v.specs, { key: "", value: "" }])}>+ Add another detail</button>
        )}
      </fieldset>

      <h2 id="photos-title" tabIndex={-1}>Photos</h2>
      <div className="notice notice-accent" style={{ marginBottom: 14 }}>
        <UploadIcon />
        <p>Add up to 8 photos, including <strong>at least one close-up of wear or defects</strong> (for Mint items, a close-up of a clean surface). Each photo is checked for resolution, focus and lighting before it&apos;s accepted.</p>
      </div>
      <div className="upload-buttons">
        <label className="btn file-btn">
          <UploadIcon /> Add photos
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple aria-label="Add photos" onChange={(e) => { upload(e.target.files, "photo"); e.target.value = ""; }} />
        </label>
        <label className="btn file-btn file-btn-wear">
          <UploadIcon /> Add wear close-up
          <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple aria-label="Add wear close-up" onChange={(e) => { upload(e.target.files, "wear_closeup"); e.target.value = ""; }} />
        </label>
      </div>
      <p className="hint" style={{ marginTop: 8 }} id="images-hint">
        {uploading > 0 ? `Checking ${uploading} photo${uploading > 1 ? "s" : ""}…` : `${photos.length} of 8 photos · ${hasCloseup ? "wear close-up added ✓" : "wear close-up still needed"}`}
      </p>
      <p className="error" id="images-err" style={{ color: "var(--danger)", fontWeight: 600 }}>{err("images")}</p>
      <div role="status" aria-live="polite" className="visually-hidden">{announce}</div>

      {rejected.length > 0 && (
        <div className="alert alert-error" style={{ marginTop: 12 }}>
          <p><strong>These photos weren&apos;t added. Retake them and try again:</strong></p>
          <ul className="issues" style={{ marginTop: 6 }}>
            {rejected.map((r) => (
              <li key={r.key}>
                <strong>{r.name}</strong>: {r.issues.length ? r.issues.map((i) => i.message).join(" ") : r.message}
              </li>
            ))}
          </ul>
          <button type="button" className="link-btn" onClick={() => setRejected([])}>Dismiss</button>
        </div>
      )}

      <ul className="upload-grid" aria-label="Photos added">
        {photos.map((p, i) => (
          <li className="upload-card" key={p.id}>
            <img src={p.thumbUrl} alt={`${p.kind === "wear_closeup" ? "Wear close-up" : "Photo"} ${i + 1}`} />
            <div className="meta">
              <span className={`tag${p.kind === "photo" ? " photo" : ""}`}>{p.kind === "wear_closeup" ? "Wear close-up" : i === 0 ? "Cover photo" : "Photo"}</span>
              {p.report && (p.report.issues.length ? (
                <ul className="issues">{p.report.issues.map((iss) => <li key={iss.code} className={iss.severity}>{iss.message}</li>)}</ul>
              ) : <span className="quality-ok">Passed quality check</span>)}
              <label className="visually-hidden" htmlFor={`kind-${p.id}`}>Photo type for photo {i + 1}</label>
              <select className="select" id={`kind-${p.id}`} value={p.kind} style={{ minHeight: 34, padding: "4px 30px 4px 8px", fontSize: ".8rem" }}
                onChange={(e) => setPhotos((list) => list.map((x) => (x.id === p.id ? { ...x, kind: e.target.value as Photo["kind"] } : x)))}>
                <option value="photo">Photo</option>
                <option value="wear_closeup">Wear close-up</option>
              </select>
              <button type="button" className="btn-danger-text" onClick={() => removePhoto(p)}>Remove<span className="visually-hidden"> photo {i + 1}</span></button>
            </div>
          </li>
        ))}
      </ul>

      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy || uploading > 0} style={{ marginTop: 24 }}>
        {busy ? "Saving…" : listingId ? "Save changes" : "Publish listing"}
      </button>
    </form>
  );
}
