import Link from "next/link";
import { GRADES, type Condition } from "@/lib/catalog";
import { formatCents, savingsPct } from "@/lib/money";

export function GradeBadge({ condition }: { condition: Condition }) {
  return (
    <span className={`grade grade-${condition}`}>
      <span className="visually-hidden">Condition: </span>
      {GRADES[condition].label}
    </span>
  );
}

export function PriceLine({ price, original, long = false }: { price: number; original: number; long?: boolean }) {
  const pct = savingsPct(price, original);
  return (
    <>
      <span className="price">{formatCents(price)}</span>
      {pct > 0 && (
        <>
          <span className="price-orig">
            <span className="visually-hidden">Originally </span>
            {formatCents(original)}
          </span>
          <span className="price-save">
            {long ? `Save ${formatCents(original - price)} (${pct}%)` : `${pct}% off`}
          </span>
        </>
      )}
    </>
  );
}

export function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <>
      <span className="stars" aria-hidden="true">
        {"★".repeat(full)}
        {"☆".repeat(5 - full)}
      </span>
      <span className="visually-hidden">{rating} out of 5 stars</span>
    </>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((c, i) =>
          c.href && i < items.length - 1 ? (
            <li key={i}>
              <Link href={c.href}>{c.label}</Link>
            </li>
          ) : (
            <li key={i} aria-current="page">
              {c.label}
            </li>
          ),
        )}
      </ol>
    </nav>
  );
}

export function OrderStatus({ status, label }: { status: string; label: string }) {
  return <span className={`status status-${status}`}>{label}</span>;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function timeAgo(date: Date | string) {
  const diff = (new Date(date).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 3600) return rtf.format(Math.round(diff / 60) || -1, "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return new Date(date).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
