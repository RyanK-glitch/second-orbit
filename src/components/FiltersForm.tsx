"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { CONDITIONS, GRADES } from "@/lib/catalog";
import { FilterIcon } from "./icons";

type Props = {
  categories: { id: string; name: string; count: number }[];
  values: { q: string; cat: string[]; cond: string[]; min: string; max: string; ships: boolean };
};

/**
 * Plain GET form (works without JS). With JS, changes apply immediately via
 * client navigation; the page itself is server-rendered.
 */
export function FiltersForm({ categories, values }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function apply() {
    const form = formRef.current;
    if (!form) return;
    const fd = new FormData(form);
    const p = new URLSearchParams();
    const q = String(fd.get("q") ?? "").trim();
    if (q) p.set("q", q);
    const cat = fd.getAll("cat").map(String);
    if (cat.length) p.set("cat", cat.join(","));
    const cond = fd.getAll("cond").map(String);
    if (cond.length) p.set("cond", cond.join(","));
    for (const k of ["min", "max"]) {
      const v = String(fd.get(k) ?? "").trim();
      if (v) p.set(k, v);
    }
    if (fd.get("ships")) p.set("ships", "1");
    const sort = new URLSearchParams(window.location.search).get("sort");
    if (sort) p.set("sort", sort);
    startTransition(() => router.replace(`/shop${p.size ? `?${p.toString().replace(/%2C/g, ",")}` : ""}`, { scroll: false }));
  }

  // Keep the uncontrolled inputs in sync when the URL changes elsewhere (chips, back button),
  // without stealing focus from a field the user is typing in.
  const signature = JSON.stringify(values);
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    for (const el of Array.from(form.elements) as HTMLInputElement[]) {
      if (el === document.activeElement) continue;
      if (el.name === "cat") el.checked = values.cat.includes(el.value);
      else if (el.name === "cond") el.checked = values.cond.includes(el.value);
      else if (el.name === "ships") el.checked = values.ships;
      else if (el.name === "q" || el.name === "min" || el.name === "max") el.value = values[el.name];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const applySoon = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(apply, 350);
  };

  return (
    <>
      <button
        className="btn filters-mobile-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="filters"
        onClick={() => setOpen((o) => !o)}
        style={{ marginBottom: 16 }}
      >
        <FilterIcon /> Filters
      </button>
      <aside className={`filters glass${open ? " open" : ""}`} id="filters" aria-label="Filters" aria-busy={pending}>
        <form
          ref={formRef}
          action="/shop"
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
          onChange={(e) => {
            const t = e.target as unknown as HTMLInputElement;
            if (t.type === "search" || t.type === "number") return;
            apply();
          }}
          onInput={(e) => {
            const t = e.target as unknown as HTMLInputElement;
            if (t.type === "search" || t.type === "number") applySoon();
          }}
        >
          <div className="field">
            <label htmlFor="f-q" className="filter-label">
              Search
            </label>
            <input className="input" id="f-q" name="q" type="search" defaultValue={values.q} placeholder="Keyword, brand…" autoComplete="off" />
          </div>
          <fieldset>
            <legend>Category</legend>
            {categories.map((c) => (
              <label className="check" key={c.id}>
                <input type="checkbox" name="cat" value={c.id} defaultChecked={values.cat.includes(c.id)} /> {c.name}
                <span className="count">
                  <span className="visually-hidden">(</span>
                  {c.count}
                  <span className="visually-hidden"> items)</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Condition</legend>
            {CONDITIONS.map((g) => (
              <label className="check" key={g}>
                <input type="checkbox" name="cond" value={g} defaultChecked={values.cond.includes(g)} /> {GRADES[g].label}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Price (USD)</legend>
            <div className="price-range">
              <label htmlFor="f-min" className="visually-hidden">Minimum price</label>
              <input className="input" id="f-min" name="min" type="number" min="0" inputMode="numeric" placeholder="Min" defaultValue={values.min} />
              <span aria-hidden="true">–</span>
              <label htmlFor="f-max" className="visually-hidden">Maximum price</label>
              <input className="input" id="f-max" name="max" type="number" min="0" inputMode="numeric" placeholder="Max" defaultValue={values.max} />
            </div>
          </fieldset>
          <fieldset>
            <legend>Delivery</legend>
            <label className="check">
              <input type="checkbox" name="ships" value="1" defaultChecked={values.ships} /> Ships to me (hide pickup-only)
            </label>
          </fieldset>
          <div style={{ display: "grid", gap: 8 }}>
            <button className="btn btn-block" type="submit">Apply filters</button>
            <a className="btn btn-ghost btn-block" href="/shop">Clear all</a>
          </div>
        </form>
      </aside>
    </>
  );
}

export function SortSelect({ value }: { value: string }) {
  const router = useRouter();
  return (
    <label htmlFor="sort">
      Sort by
      <select
        className="select"
        id="sort"
        name="sort"
        defaultValue={value}
        style={{ width: "auto" }}
        onChange={(e) => {
          const p = new URLSearchParams(window.location.search);
          p.set("sort", e.target.value);
          p.delete("page");
          router.replace(`/shop?${p.toString().replace(/%2C/g, ",")}`, { scroll: false });
        }}
      >
        <option value="newest">Newest first</option>
        <option value="price_asc">Price: low to high</option>
        <option value="price_desc">Price: high to low</option>
        <option value="condition">Condition: best first</option>
        <option value="relevance">Best match</option>
      </select>
    </label>
  );
}
