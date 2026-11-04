import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ListingControls } from "@/components/admin/AdminActions";
import { Breadcrumbs, fmtDate } from "@/components/bits";
import { getListingForAdmin, listCategories } from "@/lib/admin";
import { requirePagePermission } from "@/lib/auth/page";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/http";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Listing", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePagePermission("admin.view", `/admin/listings/${id}`);
  if (!isUuid(id)) notFound();
  const [l, categories] = await Promise.all([getListingForAdmin(id).catch(() => notFound()), listCategories()]);
  const canEdit = can(me, "listings.edit");
  const canModerate = can(me, "listings.moderate");
  return (
    <>
      <Breadcrumbs items={[{ label: "Listings", href: "/admin/listings" }, { label: l.title }]} />
      <div className="page-head">
        <span className="eyebrow">{l.status}{l.featured ? " · Featured" : ""}</span>
        <h1>{l.title}</h1>
        <p>{formatCents(l.price_cents)} · by <Link href={`/admin/users/${l.seller_id}`}>{l.seller}</Link> · listed {fmtDate(l.created_at)}</p>
      </div>
      <div className="order-grid">
        <section className="glass mod-card" aria-labelledby="edit">
          <h2 id="edit">{canEdit ? "Edit listing" : "Moderate listing"}</h2>
          {l.removed_reason && <div className="alert alert-warn"><p>Removed: {l.removed_reason}</p></div>}
          {canEdit || canModerate ? (
            <ListingControls
              listing={{
                id: l.id, title: l.title, priceCents: l.price_cents, categoryId: l.category_id, featured: l.featured, status: l.status,
                removedByModeration: l.status === "removed" && String(l.removed_reason ?? "").startsWith("moderation"),
              }}
              categories={categories.map((c) => ({ id: c.id, name: c.name }))}
              canEdit={canEdit}
              canModerate={canModerate}
            />
          ) : <p className="hint">You can view this listing but not change it.</p>}
        </section>
        <section className="glass mod-card" aria-labelledby="facts">
          <h2 id="facts">Details</h2>
          <dl className="kv">
            <dt>Brand</dt><dd>{l.brand || "—"}</dd>
            <dt>Condition</dt><dd>{l.condition}</dd>
            <dt>Original price</dt><dd>{formatCents(l.original_price_cents)}</dd>
            <dt>Shipping</dt><dd>{l.pickup_only ? "Pickup only" : formatCents(l.shipping_cents)}</dd>
            <dt>Updated</dt><dd>{fmtDate(l.updated_at)}</dd>
            <dt>Public page</dt><dd><Link href={`/listings/${l.id}`}>Open</Link></dd>
          </dl>
          <p className="quote">{l.description}</p>
        </section>
      </div>
    </>
  );
}
