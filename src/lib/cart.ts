import { sql } from "./db";
import { computeFees } from "./money";
import { storage } from "./integrations";

/** Prices a cart from current server data (never trusts client-side prices). */
export async function quoteCart(ids: string[]) {
  const unique = [...new Set(ids)].slice(0, 20);
  if (!unique.length) return { items: [], totals: emptyTotals(), unavailable: [] as string[] };
  const rows = await sql`
    SELECT l.id, l.title, l.condition, l.price_cents, l.original_price_cents, l.shipping_cents, l.pickup_only, l.seller_id,
      (l.status = 'active' OR (l.status = 'reserved' AND l.reserved_until < now())) AND u.suspended_at IS NULL AS available,
      u.display_name AS seller_name, u.location AS seller_location,
      (SELECT thumb_key FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.kind = 'wear_closeup', li.position LIMIT 1) AS thumb_key
    FROM listings l JOIN users u ON u.id = l.seller_id
    WHERE l.id = ANY(${unique}) AND l.status <> 'removed'`;
  const items = rows.map((r) => ({
    id: r.id as string,
    title: r.title as string,
    condition: r.condition as string,
    priceCents: r.price_cents as number,
    originalPriceCents: r.original_price_cents as number,
    shippingCents: r.pickup_only ? 0 : (r.shipping_cents as number),
    pickupOnly: r.pickup_only as boolean,
    sellerName: r.seller_name as string,
    sellerLocation: r.seller_location as string,
    sellerId: r.seller_id as string,
    available: r.available as boolean,
    thumbUrl: r.thumb_key ? storage().publicUrl(r.thumb_key) : null,
  }));
  const buyable = items.filter((i) => i.available);
  // Same grouping as checkout: one escrow per seller and delivery method.
  const groups = new Map<string, typeof buyable>();
  for (const i of buyable) {
    const k = `${i.sellerId}:${i.pickupOnly}`;
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const totals = emptyTotals();
  for (const g of groups.values()) {
    const f = computeFees(g.reduce((s, i) => s + i.priceCents, 0), g.reduce((s, i) => s + i.shippingCents, 0));
    totals.itemsCents += f.itemsCents;
    totals.shippingCents += f.shippingCents;
    totals.protectionFeeCents += f.protectionFeeCents;
    totals.totalCents += f.totalCents;
  }
  totals.savingsCents = buyable.reduce((s, i) => s + Math.max(0, i.originalPriceCents - i.priceCents), 0);
  totals.count = buyable.length;
  const found = new Set(items.map((i) => i.id));
  return {
    items,
    totals,
    unavailable: [...items.filter((i) => !i.available).map((i) => i.id), ...unique.filter((id) => !found.has(id))],
  };
}

const emptyTotals = () => ({ itemsCents: 0, shippingCents: 0, protectionFeeCents: 0, totalCents: 0, savingsCents: 0, count: 0 });
export type CartQuote = Awaited<ReturnType<typeof quoteCart>>;
