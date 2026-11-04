import Link from "next/link";
import { PAGE_SIZE, type TableParams } from "@/lib/admin";

/** Server-rendered table controls. Everything is a plain link or GET form, so tables work without JS and URLs are shareable. */

type Base = { path: string; params: TableParams<string> };

function href({ path, params }: Base, patch: Partial<TableParams<string>>) {
  const p = { ...params, ...patch };
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.filter) qs.set("filter", p.filter);
  qs.set("sort", p.sort);
  qs.set("dir", p.dir);
  if (p.page > 1) qs.set("page", String(p.page));
  return `${path}?${qs}`;
}

export function Toolbar({ path, params, placeholder, filters }: Base & { placeholder: string; filters?: { value: string; label: string }[] }) {
  return (
    <form className="admin-toolbar" role="search" action={path}>
      <label className="visually-hidden" htmlFor="admin-q">{placeholder}</label>
      <input className="input" id="admin-q" name="q" type="search" defaultValue={params.q} placeholder={placeholder} />
      {filters && (
        <>
          <label className="visually-hidden" htmlFor="admin-filter">Filter</label>
          <select className="select" id="admin-filter" name="filter" defaultValue={params.filter}>
            {filters.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </>
      )}
      <input type="hidden" name="sort" value={params.sort} />
      <input type="hidden" name="dir" value={params.dir} />
      <button className="btn" type="submit">Apply</button>
      {(params.q || params.filter) && <Link className="btn btn-ghost" href={path}>Clear</Link>}
    </form>
  );
}

/** Column header that toggles sorting; announces the current sort via aria-sort. */
export function SortTh({ column, label, ...base }: Base & { column: string; label: string }) {
  const active = base.params.sort === column;
  const next = active && base.params.dir === "desc" ? "asc" : "desc";
  return (
    <th scope="col" aria-sort={active ? (base.params.dir === "asc" ? "ascending" : "descending") : undefined}>
      <Link className="sort-link" href={href(base, { sort: column, dir: next, page: 1 })}>
        {label}
        <span aria-hidden="true">{active ? (base.params.dir === "asc" ? " ↑" : " ↓") : " ↕"}</span>
      </Link>
    </th>
  );
}

export function Pager({ total, ...base }: Base & { total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const { page } = base.params;
  const from = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="hint">{from}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
      <span className="actions-row" style={{ margin: 0 }}>
        {page > 1 ? <Link className="btn" href={href(base, { page: page - 1 })} rel="prev">← Previous</Link> : <span className="btn" aria-disabled="true">← Previous</span>}
        <span className="hint">Page {page} of {pages}</span>
        {page < pages ? <Link className="btn" href={href(base, { page: page + 1 })} rel="next">Next →</Link> : <span className="btn" aria-disabled="true">Next →</span>}
      </span>
    </nav>
  );
}
