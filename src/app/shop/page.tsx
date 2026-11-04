import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/bits";
import { FiltersForm, SortSelect } from "@/components/FiltersForm";
import { ListingGrid } from "@/components/ListingCard";
import { GRADES } from "@/lib/catalog";
import { getCategories, parseFilters, searchListings } from "@/lib/listings";
import { formatCents } from "@/lib/money";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters(await searchParams);
  const cats = await getCategories();
  const cat = f.categories?.length === 1 ? cats.find((c) => c.id === f.categories![0]) : null;
  const title = f.q ? `Search: ${f.q}` : cat ? `Pre-owned ${cat.name}` : "Shop pre-owned";
  return {
    title,
    alternates: { canonical: cat && !f.q ? `/shop?cat=${cat.id}` : "/shop" },
    // Filtered/search result pages shouldn't compete with product pages in search engines.
    robots: f.q || (f.categories?.length ?? 0) > 1 || f.conditions?.length ? { index: false, follow: true } : undefined,
  };
}

export default async function ShopPage({ searchParams }: Props) {
  const params = await searchParams;
  const f = parseFilters(params);
  const [result, categories] = await Promise.all([searchListings(f), getCategories()]);
  const single = f.categories?.length === 1 ? categories.find((c) => c.id === f.categories![0]) : null;
  const heading = single ? single.name : "Shop pre-owned";
  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const chips: { label: string; href: string }[] = [];
  const without = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (typeof v === "string" && k !== "page") p.set(k, v);
    mutate(p);
    const qs = p.toString().replace(/%2C/g, ",");
    return `/shop${qs ? `?${qs}` : ""}`;
  };
  if (f.q) chips.push({ label: `"${f.q}"`, href: without((p) => p.delete("q")) });
  for (const c of f.categories ?? []) {
    const name = categories.find((x) => x.id === c)?.name ?? c;
    chips.push({ label: name, href: without((p) => { const rest = (f.categories ?? []).filter((x) => x !== c); if (rest.length) p.set("cat", rest.join(",")); else p.delete("cat"); }) });
  }
  for (const c of f.conditions ?? []) {
    chips.push({ label: GRADES[c].label, href: without((p) => { const rest = (f.conditions ?? []).filter((x) => x !== c); if (rest.length) p.set("cond", rest.join(",")); else p.delete("cond"); }) });
  }
  if (f.minCents != null) chips.push({ label: `From ${formatCents(f.minCents)}`, href: without((p) => p.delete("min")) });
  if (f.maxCents != null) chips.push({ label: `Up to ${formatCents(f.maxCents)}`, href: without((p) => p.delete("max")) });
  if (f.shipsOnly) chips.push({ label: "Ships to me", href: without((p) => p.delete("ships")) });

  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: heading }]} />
      <div className="page-head">
        <h1>{heading}</h1>
        <p>Every item is one of a kind and comes with a condition grade, wear notes and a close-up photo.</p>
      </div>
      <div className="shop-layout">
        <div>
          <FiltersForm
            categories={categories}
            values={{ q: f.q ?? "", cat: f.categories ?? [], cond: f.conditions ?? [], min: one("min"), max: one("max"), ships: !!f.shipsOnly }}
          />
        </div>
        <section aria-labelledby="results-title">
          <h2 id="results-title" className="visually-hidden">Results</h2>
          <div className="toolbar">
            <p className="result-count" role="status">
              {result.total} item{result.total === 1 ? "" : "s"}
              {f.q ? ` matching "${f.q}"` : ""}
            </p>
            <SortSelect value={result.sort} />
          </div>
          {chips.length > 0 && (
            <div className="chips" aria-label="Active filters">
              {chips.map((c) => (
                <Link key={c.href + c.label} className="chip" href={c.href} aria-label={`Remove filter ${c.label}`}>
                  {c.label} <span aria-hidden="true">×</span>
                </Link>
              ))}
            </div>
          )}
          {result.items.length ? (
            <ListingGrid items={result.items} />
          ) : (
            <div className="empty glass">
              <h3>Nothing matches yet</h3>
              <p>Try fewer filters or a broader search. New items are listed every day.</p>
              <Link className="btn" href="/shop">Clear all filters</Link>
            </div>
          )}
          {pages > 1 && (
            <nav className="pagination" aria-label="Pagination">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <Link key={n} className={`btn${n === result.page ? " btn-primary" : ""}`} aria-current={n === result.page ? "page" : undefined}
                  href={without((p) => (n === 1 ? p.delete("page") : p.set("page", String(n))))}>
                  {n}
                </Link>
              ))}
            </nav>
          )}
        </section>
      </div>
    </>
  );
}
