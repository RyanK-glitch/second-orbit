import Link from "next/link";
import type { ListingCard as Card } from "@/lib/listings";
import { GradeBadge, PriceLine, timeAgo } from "./bits";

export function ListingCard({ item, headingLevel = 3 }: { item: Card; headingLevel?: 2 | 3 }) {
  const fresh = Date.now() - new Date(item.createdAt).getTime() < 864e5;
  const sold = !item.available;
  const H = `h${headingLevel}` as "h2" | "h3";
  return (
    <article className={`card glass${sold ? " is-sold" : ""}`}>
      <div className="card-media">
        {item.image ? (
          <img src={item.image.thumbUrl} alt={item.image.alt} width={600} height={600} loading="lazy" decoding="async" />
        ) : (
          <div aria-hidden="true" style={{ width: "100%", height: "100%" }} />
        )}
      </div>
      <div className="tag-row">
        {sold ? (
          <span className="pill pill-sold">{item.status === "reserved" ? "Reserved" : "Sold"}</span>
        ) : fresh ? (
          <span className="pill pill-new">Just listed</span>
        ) : null}
      </div>
      <div className="card-body">
        <GradeBadge condition={item.condition} />
        <H className="card-title">
          <Link href={`/listings/${item.id}`}>{item.title}</Link>
        </H>
        <div className="card-meta">
          <span>{item.sellerLocation || item.sellerName}</span>
          <span>{timeAgo(item.createdAt)}</span>
        </div>
        <div className="card-price">
          <PriceLine price={item.priceCents} original={item.originalPriceCents} />
        </div>
      </div>
    </article>
  );
}

export function ListingGrid({ items }: { items: Card[] }) {
  return (
    <div className="grid">
      {items.map((i) => (
        <ListingCard key={i.id} item={i} />
      ))}
    </div>
  );
}
