"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { api } from "../api";

/** Shared state for an admin action: a required audit note, busy flag and errors. */
function useAction() {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function run(path: string, method: string, body: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    setDone(null);
    setFieldErrors({});
    const r = await api(path, method, body);
    setBusy(false);
    if (r.ok) {
      setDone(success);
      setNote("");
      router.refresh();
      return true;
    }
    setError(r.fieldErrors.note ?? r.error);
    setFieldErrors(r.fieldErrors);
    return false;
  }
  return { note, setNote, error, fieldErrors, done, busy, run };
}

function NoteField({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label htmlFor={id}>Note for the audit log</label>
      <input className="input" id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={1000} placeholder="Why are you making this change?" />
    </div>
  );
}

function Feedback({ error, done }: { error: string | null; done: string | null }) {
  return (
    <div aria-live="polite">
      {error && <div className="alert alert-error" role="alert"><p>{error}</p></div>}
      {done && <div className="alert alert-success"><p>{done}</p></div>}
    </div>
  );
}

// ---------------------------------------------------------------- users

export function UserControls({ userId, role, suspended, canManage, canSuspend }: {
  userId: string;
  role: "user" | "moderator" | "admin";
  suspended: boolean;
  canManage: boolean;
  canSuspend: boolean;
}) {
  const id = useId();
  const a = useAction();
  const [nextRole, setNextRole] = useState(role);
  const url = `/api/admin/users/${userId}`;
  return (
    <div>
      <NoteField id={`${id}-note`} value={a.note} onChange={a.setNote} />
      {canManage && (
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor={`${id}-role`}>Role</label>
          <select className="select" id={`${id}-role`} value={nextRole} onChange={(e) => setNextRole(e.target.value as typeof role)}>
            <option value="user">Member</option>
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
          </select>
        </div>
      )}
      <Feedback error={a.error} done={a.done} />
      <div className="actions-row">
        {canManage && (
          <button type="button" className="btn btn-primary" disabled={a.busy || nextRole === role} onClick={() => a.run(url, "PATCH", { role: nextRole, note: a.note }, "Role updated.")}>
            Save role
          </button>
        )}
        {canSuspend && (
          <button type="button" className="btn" disabled={a.busy} onClick={() => a.run(url, "PATCH", { suspended: !suspended, note: a.note }, suspended ? "Account enabled." : "Account disabled and signed out.")}>
            {suspended ? "Enable account" : "Disable account"}
          </button>
        )}
        {canSuspend && (
          <button type="button" className="btn btn-ghost" disabled={a.busy} onClick={() => a.run(`${url}/sessions`, "DELETE", { note: a.note }, "Signed out of all devices.")}>
            Sign out everywhere
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- listings

export function ListingControls({ listing, categories, canEdit, canModerate }: {
  listing: { id: string; title: string; priceCents: number; categoryId: string; featured: boolean; status: string; removedByModeration: boolean };
  categories: { id: string; name: string }[];
  canEdit: boolean;
  canModerate: boolean;
}) {
  const id = useId();
  const a = useAction();
  const [title, setTitle] = useState(listing.title);
  const [price, setPrice] = useState((listing.priceCents / 100).toFixed(2));
  const [categoryId, setCategoryId] = useState(listing.categoryId);
  const [featured, setFeatured] = useState(listing.featured);
  const url = `/api/admin/listings/${listing.id}`;

  function save(e: React.FormEvent) {
    e.preventDefault();
    a.run(url, "PATCH", { title, priceCents: Math.round(Number.parseFloat(price) * 100), categoryId, featured, note: a.note }, "Listing saved.");
  }

  return (
    <form onSubmit={save} noValidate>
      {canEdit && (
        <>
          <div className="field">
            <label htmlFor={`${id}-title`}>Title</label>
            <input className="input" id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} aria-invalid={a.fieldErrors.title ? true : undefined} aria-describedby={`${id}-title-err`} />
            <p className="error" id={`${id}-title-err`}>{a.fieldErrors.title}</p>
          </div>
          <div className="row">
            <div className="field">
              <label htmlFor={`${id}-price`}>Price (USD)</label>
              <input className="input" id={`${id}-price`} type="number" min="0.01" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} aria-invalid={a.fieldErrors.priceCents ? true : undefined} aria-describedby={`${id}-price-err`} />
              <p className="error" id={`${id}-price-err`}>{a.fieldErrors.priceCents}</p>
            </div>
            <div className="field">
              <label htmlFor={`${id}-cat`}>Category</label>
              <select className="select" id={`${id}-cat`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <label className="check" style={{ marginBottom: 18 }}>
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Featured on the home page
          </label>
        </>
      )}
      <NoteField id={`${id}-note`} value={a.note} onChange={a.setNote} />
      <Feedback error={a.error} done={a.done} />
      <div className="actions-row">
        {canEdit && <button type="submit" className="btn btn-primary" disabled={a.busy}>Save changes</button>}
        {canModerate && ["active", "reserved"].includes(listing.status) && (
          <button type="button" className="btn" disabled={a.busy} onClick={() => a.run(url, "PATCH", { status: "removed", note: a.note }, "Listing removed.")}>Remove listing</button>
        )}
        {canModerate && listing.removedByModeration && (
          <button type="button" className="btn" disabled={a.busy} onClick={() => a.run(url, "PATCH", { status: "active", note: a.note }, "Listing restored.")}>Restore listing</button>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- categories

type Category = { id: string; name: string; blurb: string; sort: number; listings: number };

function CategoryFields({ id, value, onChange, errors, withSlug }: {
  id: string;
  value: Omit<Category, "listings">;
  onChange: (v: Omit<Category, "listings">) => void;
  errors: Record<string, string>;
  withSlug?: boolean;
}) {
  const f = (key: "id" | "name" | "blurb" | "sort", label: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="field">
      <label htmlFor={`${id}-${key}`}>{label}</label>
      <input
        className="input"
        id={`${id}-${key}`}
        value={String(value[key])}
        onChange={(e) => onChange({ ...value, [key]: key === "sort" ? Number(e.target.value) : e.target.value })}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={`${id}-${key}-err`}
        {...extra}
      />
      <p className="error" id={`${id}-${key}-err`}>{errors[key]}</p>
    </div>
  );
  return (
    <div className="category-fields">
      {withSlug && f("id", "Slug (used in URLs)", { placeholder: "e.g. sports", maxLength: 30 })}
      {f("name", "Name", { maxLength: 40 })}
      {f("blurb", "Short description", { maxLength: 120 })}
      {f("sort", "Sort order", { type: "number", min: 0, max: 1000 })}
    </div>
  );
}

export function NewCategoryForm() {
  const id = useId();
  const a = useAction();
  const blank = { id: "", name: "", blurb: "", sort: 100 };
  const [v, setV] = useState(blank);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await a.run("/api/admin/categories", "POST", v, `Created “${v.name}”.`)) setV(blank);
      }}
      noValidate
    >
      <CategoryFields id={id} value={v} onChange={setV} errors={a.fieldErrors} withSlug />
      <Feedback error={a.error} done={a.done} />
      <button className="btn btn-primary" type="submit" disabled={a.busy}>Create category</button>
    </form>
  );
}

export function CategoryEditor({ category }: { category: Category }) {
  const id = useId();
  const a = useAction();
  const [v, setV] = useState({ id: category.id, name: category.name, blurb: category.blurb, sort: category.sort });
  const url = `/api/admin/categories/${category.id}`;
  return (
    <details className="mod-card glass">
      <summary>
        <strong>{category.name}</strong> <span className="hint">/{category.id} · {category.listings} listing{category.listings === 1 ? "" : "s"} · sort {category.sort}</span>
      </summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          a.run(url, "PATCH", { name: v.name, blurb: v.blurb, sort: v.sort }, "Saved.");
        }}
        noValidate
        style={{ marginTop: 14 }}
      >
        <CategoryFields id={id} value={v} onChange={setV} errors={a.fieldErrors} />
        <Feedback error={a.error} done={a.done} />
        <div className="actions-row">
          <button className="btn btn-primary" type="submit" disabled={a.busy}>Save</button>
          <button
            className="btn"
            type="button"
            disabled={a.busy || category.listings > 0}
            title={category.listings > 0 ? "Move its listings to another category first." : undefined}
            onClick={() => {
              if (window.confirm(`Delete the “${category.name}” category?`)) a.run(url, "DELETE", {}, "Deleted.");
            }}
          >
            Delete
          </button>
        </div>
      </form>
    </details>
  );
}
