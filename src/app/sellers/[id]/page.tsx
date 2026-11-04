import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs, initials, Stars, timeAgo } from "@/components/bits";
import { BadgeIcon } from "@/components/icons";
import { ListingGrid } from "@/components/ListingCard";
import { ReportButton } from "@/components/ReportButton";
import { getCurrentUser } from "@/lib/auth/session";
import { isUuid } from "@/lib/http";
import { getSellerSummary, listingsBySeller } from "@/lib/listings";
import { sellerReviews } from "@/lib/orders";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const s = isUuid(id) ? await getSellerSummary(id) : null;
  if (!s) return { title: "Seller not found", robots: { index: false } };
  return {
    title: `${s.displayName}: seller profile`,
    description: `${s.displayName}${s.location ? ` in ${s.location}` : ""}: ${s.sales} completed sales${s.rating ? `, rated ${s.rating}/5` : ""}.`,
    alternates: { canonical: `/sellers/${s.id}` },
  };
}

export default async function SellerPage({ params }: Props) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const s = await getSellerSummary(id);
  if (!s) notFound();
  const [listings, reviews, viewer] = await Promise.all([listingsBySeller(id), sellerReviews(id), getCurrentUser()]);
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: s.displayName }]} />
      <section className="panel glass" aria-labelledby="seller-title">
        <div className="seller">
          <div className="avatar" aria-hidden="true">{initials(s.displayName)}</div>
          <div>
            <h1 id="seller-title" style={{ margin: 0 }}>{s.displayName}</h1>
            <div className="seller-meta">
              {s.verified && <span className="verified"><BadgeIcon /> ID verified</span>} {s.location && ` · ${s.location}`} · Member since {new Date(s.memberSince).getFullYear()}
            </div>
          </div>
        </div>
        {s.bio && <p style={{ marginTop: 14, whiteSpace: "pre-line" }}>{s.bio}</p>}
        <div className="seller-stats" style={{ maxWidth: 520 }}>
          <div><strong>{s.rating != null ? s.rating.toFixed(1) : "–"}</strong>average rating</div>
          <div><strong>{s.reviewCount}</strong>verified reviews</div>
          <div><strong>{s.sales}</strong>completed sales</div>
        </div>
        {viewer && viewer.id !== s.id && (
          <div style={{ marginTop: 12 }}><ReportButton targetType="user" targetId={s.id} label="Report this seller" /></div>
        )}
      </section>

      <section className="section" aria-labelledby="seller-listings">
        <div className="section-head"><h2 id="seller-listings">For sale ({listings.length})</h2></div>
        {listings.length ? <ListingGrid items={listings} /> : <p className="hint">Nothing for sale right now.</p>}
      </section>

      <section className="section" aria-labelledby="seller-reviews">
        <div className="section-head"><h2 id="seller-reviews">Reviews</h2></div>
        <p className="hint">Only buyers who received an item from this seller can leave a review.</p>
        {reviews.length ? (
          <ul className="conv-list">
            {reviews.map((r, i) => (
              <li key={i} className="glass" style={{ padding: 16 }}>
                <div><Stars rating={r.rating} /> <strong>{r.reviewer_name}</strong> <span className="hint">· {timeAgo(r.created_at)}</span></div>
                {r.body && <p style={{ margin: "6px 0 0" }}>{r.body}</p>}
              </li>
            ))}
          </ul>
        ) : <p>No reviews yet.</p>}
      </section>
    </>
  );
}
