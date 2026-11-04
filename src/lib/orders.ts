import { config, isMock } from "./env";
import { sql, type Tx } from "./db";
import { notifyUser } from "./email";
import { computeFees } from "./money";
import { canReview, EscrowTransitionError, inspectionWindowLapsed, nextStatus, type EscrowEvent, type OrderStatus } from "./escrow";
import { analytics, payments, shipping, storage } from "./integrations";
import { MOCK_TRACKING_STEPS } from "./integrations/shipping";
import type { Address, Parcel, ShipmentStatus, TrackingEvent } from "./integrations/types";
import { badRequest, conflict, forbidden, HttpError, notFound } from "./http";
import { staffNeedsTwoFactor, type SessionUser } from "./auth/session";

const RESERVATION_MINUTES = 35; // Stripe Checkout sessions must live at least 30 minutes.

export const SAMPLE_ADDRESS: Address = {
  name: "Alex Sample",
  line1: "417 Montgomery St",
  line2: "Floor 5",
  city: "San Francisco",
  state: "CA",
  postalCode: "94104",
  country: "US",
};

const PARCELS: Record<string, Parcel> = {
  electronics: { weightOz: 48, lengthIn: 12, widthIn: 9, heightIn: 5 },
  fashion: { weightOz: 32, lengthIn: 14, widthIn: 11, heightIn: 4 },
  books: { weightOz: 40, lengthIn: 11, widthIn: 9, heightIn: 4 },
  home: { weightOz: 160, lengthIn: 18, widthIn: 14, heightIn: 12 },
  furniture: { weightOz: 640, lengthIn: 36, widthIn: 24, heightIn: 20 },
  hobby: { weightOz: 240, lengthIn: 40, widthIn: 16, heightIn: 6 },
};

/** Moves an order through the escrow state machine; maps invalid moves to 409s. */
function transition(from: OrderStatus, event: EscrowEvent): OrderStatus {
  try {
    return nextStatus(from, event);
  } catch (e) {
    if (e instanceof EscrowTransitionError) throw conflict(e.message);
    throw e;
  }
}

const orderUrl = (id: string) => `${config.appUrl}/account/orders/${id}`;

/** The template variables almost every order email needs. */
async function orderVars(tx: Tx, orderId: string) {
  const [r] = await tx`SELECT string_agg(title, ', ') AS title FROM order_items WHERE order_id = ${orderId}`;
  return { title: (r?.title as string) ?? "your order", orderUrl: orderUrl(orderId) };
}

async function lockOrder(tx: Tx, orderId: string) {
  const [o] = await tx`SELECT * FROM orders WHERE id = ${orderId} FOR UPDATE`;
  if (!o) throw notFound("Order not found.");
  return o;
}

// ---------------------------------------------------------------- checkout

export async function createCheckout(buyer: SessionUser, listingIds: string[]) {
  const ids = [...new Set(listingIds)];
  if (!ids.length) throw badRequest("Your cart is empty.");
  if (ids.length > 20) throw badRequest("Please check out at most 20 items at a time.");
  const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60_000);

  const result = await sql.begin(async (tx) => {
    const listings = await tx`
      SELECT l.id, l.title, l.seller_id, l.price_cents, l.shipping_cents, l.pickup_only, l.category_id,
             u.stripe_account_id, u.payouts_enabled, u.suspended_at
      FROM listings l JOIN users u ON u.id = l.seller_id
      WHERE l.id = ANY(${ids})
        AND (l.status = 'active' OR (l.status = 'reserved' AND l.reserved_until < now()))
      FOR UPDATE OF l`;
    if (listings.length !== ids.length) {
      throw conflict("One or more items in your cart were just sold or reserved. Please review your cart.");
    }
    for (const l of listings) {
      if (l.seller_id === buyer.id) throw badRequest("You can't buy your own listing.");
      if (l.suspended_at || !l.payouts_enabled) throw conflict(`"${l.title}" is temporarily unavailable.`);
    }

    // One order (and escrow) per seller and delivery method.
    const groups = new Map<string, typeof listings>();
    for (const l of listings) {
      const key = `${l.seller_id}:${l.pickup_only ? "pickup" : "ship"}`;
      groups.set(key, [...(groups.get(key) ?? []), l] as typeof listings);
    }

    const [checkout] = await tx`
      INSERT INTO checkouts (buyer_id, total_cents, expires_at) VALUES (${buyer.id}, 0, ${expiresAt}) RETURNING id`;
    let total = 0;
    const lines: { name: string; amountCents: number; listingId: string }[] = [];
    for (const [key, items] of groups) {
      const [sellerId, method] = key.split(":");
      const itemsCents = items.reduce((s, l) => s + l.price_cents, 0);
      const shippingCents = method === "ship" ? items.reduce((s, l) => s + l.shipping_cents, 0) : 0;
      const fees = computeFees(itemsCents, shippingCents);
      total += fees.totalCents;
      const [order] = await tx`
        INSERT INTO orders (checkout_id, buyer_id, seller_id, delivery_method, items_cents, shipping_cents,
                            protection_fee_cents, platform_fee_cents, total_cents)
        VALUES (${checkout.id}, ${buyer.id}, ${sellerId}, ${method}, ${itemsCents}, ${shippingCents},
                ${fees.protectionFeeCents}, ${fees.platformFeeCents}, ${fees.totalCents})
        RETURNING id`;
      for (const l of items) {
        await tx`INSERT INTO order_items (order_id, listing_id, title, price_cents, shipping_cents)
                 VALUES (${order.id}, ${l.id}, ${l.title}, ${l.price_cents}, ${method === "ship" ? l.shipping_cents : 0})`;
        lines.push({ name: l.title, amountCents: l.price_cents, listingId: l.id });
      }
      if (shippingCents) lines.push({ name: "Shipping", amountCents: shippingCents, listingId: "" });
      lines.push({ name: "Buyer protection", amountCents: fees.protectionFeeCents, listingId: "" });
    }
    await tx`UPDATE checkouts SET total_cents = ${total} WHERE id = ${checkout.id}`;
    await tx`UPDATE listings SET status = 'reserved', reserved_until = ${expiresAt} WHERE id = ANY(${ids})`;
    const shippingRequired = listings.some((l) => !l.pickup_only);
    return { checkoutId: checkout.id as string, lines, shippingRequired };
  });

  try {
    const firstImages = await sql`
      SELECT DISTINCT ON (listing_id) listing_id, storage_key FROM listing_images
      WHERE listing_id = ANY(${ids}) ORDER BY listing_id, kind = 'wear_closeup', position`;
    const imageFor = new Map(firstImages.map((r) => [r.listing_id, storage().publicUrl(r.storage_key)]));
    const session = await payments().createCheckoutSession({
      checkoutId: result.checkoutId,
      buyerEmail: buyer.email,
      lines: result.lines.map((l) => ({ name: l.name, amountCents: l.amountCents, imageUrl: imageFor.get(l.listingId) })),
      shippingRequired: result.shippingRequired,
      transferGroup: `checkout_${result.checkoutId}`,
      successUrl: `${config.appUrl}/checkout/success?checkout=${result.checkoutId}`,
      cancelUrl: `${config.appUrl}/checkout/cancel?checkout=${result.checkoutId}`,
      expiresAt,
    });
    await sql`UPDATE checkouts SET provider_session_id = ${session.sessionId} WHERE id = ${result.checkoutId}`;
    return { checkoutId: result.checkoutId, url: session.url };
  } catch (err) {
    await expireCheckout(result.checkoutId);
    throw err;
  }
}

/** Called from the Stripe webhook (or the mock checkout). Idempotent. */
export async function completeCheckout(checkoutId: string, paid: { paymentIntentId: string; chargeId: string | null; shipTo: Address | null }) {
  const changed = await sql.begin(async (tx) => {
    const [c] = await tx`SELECT * FROM checkouts WHERE id = ${checkoutId} FOR UPDATE`;
    if (!c) throw notFound("Checkout not found.");
    if (c.status === "paid") return false;
    await tx`UPDATE checkouts SET status = 'paid', payment_intent_id = ${paid.paymentIntentId}, charge_id = ${paid.chargeId}
             WHERE id = ${checkoutId}`;
    const orders = await tx`SELECT * FROM orders WHERE checkout_id = ${checkoutId} FOR UPDATE`;
    for (const o of orders) {
      // A checkout that expired locally but was still paid at Stripe is honoured.
      const status = o.status === "cancelled" ? "paid" : transition(o.status, "pay");
      await tx`UPDATE orders SET status = ${status}, paid_at = now(),
               ship_to = ${o.delivery_method === "ship" && paid.shipTo ? tx.json(paid.shipTo) : null}
               WHERE id = ${o.id}`;
      const vars = await orderVars(tx, o.id);
      await notifyUser(tx, o.buyer_id, "orderPaid", vars, { dedupeKey: `order-paid:${o.id}` });
      await notifyUser(tx, o.seller_id, "itemSold", { ...vars, payoutCents: o.items_cents + o.shipping_cents - o.platform_fee_cents }, { dedupeKey: `item-sold:${o.id}` });
    }
    await tx`UPDATE listings SET status = 'sold', reserved_until = NULL
             WHERE id IN (SELECT oi.listing_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.checkout_id = ${checkoutId})`;
    return true;
  });
  if (changed) {
    const [c] = await sql`SELECT total_cents FROM checkouts WHERE id = ${checkoutId}`;
    await analytics().track("Purchase", { path: "/checkout/success", props: { revenue_band: band(c.total_cents) } });
  }
  return changed;
}

const band = (cents: number) => (cents < 5000 ? "<50" : cents < 20000 ? "50-200" : cents < 100000 ? "200-1000" : "1000+");

/** Releases reservations for an unpaid checkout (Stripe session expired, or creation failed). */
export async function expireCheckout(checkoutId: string) {
  await sql.begin(async (tx) => {
    const [c] = await tx`SELECT status FROM checkouts WHERE id = ${checkoutId} FOR UPDATE`;
    if (!c || c.status !== "open") return;
    await tx`UPDATE checkouts SET status = 'expired' WHERE id = ${checkoutId}`;
    await tx`UPDATE orders SET status = 'cancelled' WHERE checkout_id = ${checkoutId} AND status = 'pending_payment'`;
    await tx`UPDATE listings SET status = 'active', reserved_until = NULL
             WHERE status = 'reserved' AND id IN (
               SELECT oi.listing_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.checkout_id = ${checkoutId})`;
  });
}

/** Success page fallback: if the webhook hasn't arrived yet, ask the provider directly. */
export async function syncCheckout(checkoutId: string, buyerId: string) {
  const [c] = await sql`SELECT status, provider_session_id FROM checkouts WHERE id = ${checkoutId} AND buyer_id = ${buyerId}`;
  if (!c) return null;
  if (c.status === "open" && c.provider_session_id && !isMock("payments")) {
    const paid = await payments().getPaidSession(c.provider_session_id);
    if (paid) await completeCheckout(checkoutId, paid);
  }
  const orders = await sql`SELECT id, status FROM orders WHERE checkout_id = ${checkoutId} ORDER BY created_at`;
  const [fresh] = await sql`SELECT status FROM checkouts WHERE id = ${checkoutId}`;
  return { status: fresh.status as string, orders };
}

// ---------------------------------------------------------------- reading orders

export type OrderView = Awaited<ReturnType<typeof getOrderForUser>>;

export async function getOrderForUser(orderId: string, user: SessionUser) {
  const [o] = await sql`
    SELECT o.*, b.display_name AS buyer_name, s.display_name AS seller_name, s.location AS seller_location
    FROM orders o JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id
    WHERE o.id = ${orderId}`;
  if (!o) throw notFound("Order not found.");
  const role = o.buyer_id === user.id ? "buyer" : o.seller_id === user.id ? "seller" : null;
  const isMod = (user.role === "moderator" || user.role === "admin") && !staffNeedsTwoFactor(user);
  if (!role && !isMod) throw notFound("Order not found.");
  const [items, [shipment], pickups, [dispute], [review]] = await Promise.all([
    sql`SELECT oi.*, (SELECT li.thumb_key FROM listing_images li WHERE li.listing_id = oi.listing_id
          ORDER BY li.kind = 'wear_closeup', li.position LIMIT 1) AS thumb_key
        FROM order_items oi WHERE oi.order_id = ${orderId}`,
    sql`SELECT * FROM shipments WHERE order_id = ${orderId}`,
    sql`SELECT p.*, u.display_name AS proposed_by_name FROM pickups p JOIN users u ON u.id = p.proposed_by
        WHERE p.order_id = ${orderId} ORDER BY p.created_at DESC`,
    sql`SELECT * FROM disputes WHERE order_id = ${orderId}`,
    sql`SELECT * FROM reviews WHERE order_id = ${orderId}`,
  ]);
  const status = o.status as OrderStatus;
  const frozen = !!o.payout_frozen_at;
  const releaseAt = o.delivered_at ? new Date(new Date(o.delivered_at).getTime() + config.inspectionWindowHours * 3600_000) : null;
  return {
    order: o,
    role: role ?? ("moderator" as const),
    items: items.map((i) => ({
      listing_id: i.listing_id as string,
      title: i.title as string,
      price_cents: i.price_cents as number,
      thumbUrl: i.thumb_key ? storage().publicUrl(i.thumb_key) : null,
    })),
    shipment: shipment ?? null,
    pickups,
    dispute: dispute ?? null,
    review: review ?? null,
    releaseAt,
    payoutFrozen: frozen,
    // Only the seller (to ship) and the buyer see the address; moderators see the city only.
    shipTo: role ? (o.ship_to as Address | null) : null,
    can: {
      createLabel: role === "seller" && status === "paid" && o.delivery_method === "ship",
      simulateTracking: !!shipment && isMock("shipping") && status === "shipped",
      proposePickup: !!role && status === "paid" && o.delivery_method === "pickup",
      confirmCollected: role === "buyer" && status === "paid" && o.delivery_method === "pickup" && pickups.some((p) => p.status === "accepted"),
      confirmReceipt: role === "buyer" && status === "delivered" && !frozen,
      dispute: role === "buyer" && (status === "paid" || status === "shipped" || status === "delivered") && !dispute && !frozen,
      cancel: role === "seller" && status === "paid" && !shipment && !frozen,
      simulateChargeback: role === "buyer" && isMock("payments") && !frozen && ["paid", "shipped", "delivered", "completed"].includes(status),
      review: role === "buyer" && canReview(status) && !review,
      respondDispute: role === "seller" && dispute?.status === "open" && !dispute?.seller_response,
    },
  };
}

export async function listOrders(userId: string, as: "buyer" | "seller") {
  const col = as === "buyer" ? sql`o.buyer_id` : sql`o.seller_id`;
  return sql`
    SELECT o.id, o.status, o.total_cents, o.items_cents, o.created_at, o.delivery_method,
           b.display_name AS buyer_name, s.display_name AS seller_name,
           (SELECT string_agg(oi.title, ', ') FROM order_items oi WHERE oi.order_id = o.id) AS titles
    FROM orders o JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id
    WHERE ${col} = ${userId} AND o.status <> 'pending_payment' AND o.status <> 'cancelled'
    ORDER BY o.created_at DESC LIMIT 100`;
}

// ---------------------------------------------------------------- fulfilment

export async function createLabel(orderId: string, seller: SessionUser) {
  const o = await sql.begin(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.seller_id !== seller.id) throw forbidden();
    if (o.delivery_method !== "ship") throw badRequest("This order is collected in person.");
    transition(o.status, "ship");
    const [existing] = await tx`SELECT id FROM shipments WHERE order_id = ${orderId}`;
    if (existing) throw conflict("A label already exists for this order.");
    return o;
  });
  const [u] = await sql`SELECT ship_from, display_name FROM users WHERE id = ${seller.id}`;
  const mock = isMock("shipping");
  const from = (u.ship_from as Address | null) ?? (mock ? { ...SAMPLE_ADDRESS, name: u.display_name } : null);
  if (!from) throw badRequest("Add your ship-from address in Account settings before buying a label.");
  const to = (o.ship_to as Address | null) ?? (mock ? SAMPLE_ADDRESS : null);
  if (!to) throw badRequest("This order has no shipping address.");
  const [item] = await sql`SELECT l.category_id FROM order_items oi JOIN listings l ON l.id = oi.listing_id WHERE oi.order_id = ${orderId} LIMIT 1`;
  const label = await shipping().createLabel({ orderId, from, to, parcel: PARCELS[item?.category_id] ?? PARCELS.electronics });

  await sql.begin(async (tx) => {
    const locked = await lockOrder(tx, orderId);
    const status = transition(locked.status, "ship");
    await tx`INSERT INTO shipments (order_id, provider, provider_shipment_id, carrier, service, tracking_code, label_url, status, events)
             VALUES (${orderId}, ${shipping().name}, ${label.providerShipmentId}, ${label.carrier}, ${label.service},
                     ${label.trackingCode}, ${label.labelUrl}, ${label.status},
                     ${tx.json([{ status: "pre_transit", message: "Shipping label created", at: new Date().toISOString() }])})`;
    await tx`UPDATE orders SET status = ${status}, shipped_at = now() WHERE id = ${orderId}`;
    await notifyUser(tx, locked.buyer_id, "orderShipped", { ...(await orderVars(tx, orderId)), carrier: label.carrier, trackingCode: label.trackingCode }, { dedupeKey: `order-shipped:${orderId}` });
  });
  return label;
}

/** Applies a carrier tracking update (EasyPost webhook or mock simulator). */
export async function applyTrackingUpdate(trackingCode: string, status: ShipmentStatus, events: TrackingEvent[]) {
  await sql.begin(async (tx) => {
    const [s] = await tx`SELECT * FROM shipments WHERE tracking_code = ${trackingCode} FOR UPDATE`;
    if (!s) return;
    await tx`UPDATE shipments SET status = ${status}, events = ${tx.json(events)}, updated_at = now() WHERE id = ${s.id}`;
    if (status === "delivered") {
      const o = await lockOrder(tx, s.order_id);
      if (o.status === "shipped") {
        await tx`UPDATE orders SET status = ${transition(o.status, "deliver")}, delivered_at = now() WHERE id = ${o.id}`;
        await notifyUser(tx, o.buyer_id, "orderDelivered", { ...(await orderVars(tx, o.id)), windowHours: config.inspectionWindowHours }, { dedupeKey: `order-delivered:${o.id}` });
      }
    }
  });
}

/** Mock carrier: advances the shipment one step. Only available while the shipping adapter is mocked. */
export async function simulateTracking(orderId: string, user: SessionUser) {
  if (!isMock("shipping")) throw forbidden("Tracking simulation is only available with the mock carrier.");
  const [s] = await sql`
    SELECT s.*, o.buyer_id, o.seller_id FROM shipments s JOIN orders o ON o.id = s.order_id WHERE s.order_id = ${orderId}`;
  if (!s) throw notFound("No shipment for this order.");
  if (s.buyer_id !== user.id && s.seller_id !== user.id) throw forbidden();
  const idx = MOCK_TRACKING_STEPS.findIndex((step) => step.status === s.status);
  const next = MOCK_TRACKING_STEPS[idx + 1] ?? MOCK_TRACKING_STEPS[0];
  if (s.status === "delivered") return s.status;
  const events = [...(s.events as TrackingEvent[]), { status: next.status, message: next.message, at: new Date().toISOString(), location: "Mock City, CA" }];
  await applyTrackingUpdate(s.tracking_code, next.status, events);
  return next.status;
}

export async function proposePickup(orderId: string, user: SessionUser, input: { startsAt: Date; location: string; note: string }) {
  await sql.begin(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.buyer_id !== user.id && o.seller_id !== user.id) throw forbidden();
    if (o.delivery_method !== "pickup" || o.status !== "paid") throw conflict("Pickup can't be scheduled for this order.");
    if (input.startsAt.getTime() < Date.now() + 15 * 60_000) throw badRequest("Pick a time at least 15 minutes from now.");
    await tx`UPDATE pickups SET status = 'cancelled' WHERE order_id = ${orderId} AND status IN ('proposed', 'accepted')`;
    await tx`INSERT INTO pickups (order_id, proposed_by, starts_at, location, note)
             VALUES (${orderId}, ${user.id}, ${input.startsAt}, ${input.location}, ${input.note})`;
  });
}

export async function acceptPickup(orderId: string, pickupId: string, user: SessionUser) {
  await sql.begin(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.buyer_id !== user.id && o.seller_id !== user.id) throw forbidden();
    const [p] = await tx`SELECT * FROM pickups WHERE id = ${pickupId} AND order_id = ${orderId} FOR UPDATE`;
    if (!p || p.status !== "proposed") throw conflict("That pickup time is no longer open.");
    if (p.proposed_by === user.id) throw badRequest("The other person needs to accept the time you proposed.");
    await tx`UPDATE pickups SET status = 'accepted' WHERE id = ${pickupId}`;
  });
}

/** Buyer confirms they collected the item; starts the inspection window. */
export async function confirmCollected(orderId: string, buyer: SessionUser) {
  await sql.begin(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.buyer_id !== buyer.id) throw forbidden();
    if (o.delivery_method !== "pickup") throw badRequest("This order ships by carrier.");
    const status = transition(o.status, "deliver");
    await tx`UPDATE pickups SET status = 'completed' WHERE order_id = ${orderId} AND status = 'accepted'`;
    await tx`UPDATE orders SET status = ${status}, delivered_at = now() WHERE id = ${orderId}`;
  });
}

// ---------------------------------------------------------------- escrow release / refund

/** Every release and refund path goes through this, so nothing can move money the bank is deciding on. */
function assertNotFrozen(o: Record<string, any>) {
  if (o.payout_frozen_at) throw conflict("This payment is on hold because of a card chargeback. Nothing can be released or refunded until the bank decides.");
}

/** Pays the seller their share. Called on buyer confirmation, auto-release or a dispute resolved for the seller. */
async function releaseFunds(tx: Tx, o: Record<string, any>) {
  assertNotFrozen(o);
  const [seller] = await tx`SELECT stripe_account_id FROM users WHERE id = ${o.seller_id}`;
  const [c] = await tx`SELECT charge_id FROM checkouts WHERE id = ${o.checkout_id}`;
  if (!seller?.stripe_account_id) throw new HttpError(409, "The seller hasn't finished payout setup; funds stay held.");
  const payout = o.items_cents + o.shipping_cents - o.platform_fee_cents;
  const { transferId } = await payments().transfer({
    amountCents: payout,
    destination: seller.stripe_account_id,
    transferGroup: `checkout_${o.checkout_id}`,
    sourceChargeId: c?.charge_id ?? null,
    idempotencyKey: `release-${o.id}`,
  });
  await tx`UPDATE orders SET status = ${transition(o.status, "release")}, transfer_id = ${transferId}, completed_at = now()
           WHERE id = ${o.id}`;
  await notifyUser(tx, o.seller_id, "payoutSent", { ...(await orderVars(tx, o.id)), amountCents: payout }, { dedupeKey: `payout-sent:${o.id}` });
}

export async function confirmReceipt(orderId: string, buyer: SessionUser) {
  await sql.begin(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.buyer_id !== buyer.id) throw forbidden();
    if (o.status !== "delivered") throw conflict("You can confirm once the item has been delivered.");
    await releaseFunds(tx, o);
  });
  await analytics().track("Order completed", { path: "/account/orders" });
}

/** Cron: release funds for orders whose inspection window lapsed without a dispute. */
export async function autoReleaseDue(now = new Date()) {
  const due = await sql`SELECT id, delivered_at FROM orders WHERE status = 'delivered' AND payout_frozen_at IS NULL ORDER BY delivered_at LIMIT 200`;
  let released = 0;
  for (const row of due) {
    if (!inspectionWindowLapsed(row.delivered_at, config.inspectionWindowHours, now)) continue;
    try {
      await sql.begin(async (tx) => {
        const o = await lockOrder(tx, row.id);
        if (o.status === "delivered" && !o.payout_frozen_at) await releaseFunds(tx, o);
      });
      released++;
    } catch (err) {
      console.error("[auto-release]", row.id, (err as Error).message);
    }
  }
  return { checked: due.length, released };
}

/** Cron: warns buyers while they can still report a problem. The dedupe key means once per order. */
export async function sendInspectionReminders(now = new Date()) {
  const remindBeforeHours = Math.min(12, config.inspectionWindowHours / 2);
  const cutoff = new Date(now.getTime() - (config.inspectionWindowHours - remindBeforeHours) * 3600_000);
  const orders = await sql`
    SELECT o.id, o.buyer_id FROM orders o
    WHERE o.status = 'delivered' AND o.payout_frozen_at IS NULL AND o.delivered_at <= ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM email_outbox e WHERE e.dedupe_key = 'inspection-ending:' || o.id::text)
    LIMIT 200`;
  await sql.begin(async (tx) => {
    for (const o of orders) await notifyUser(tx, o.buyer_id, "inspectionEnding", await orderVars(tx, o.id), { dedupeKey: `inspection-ending:${o.id}` });
  });
  return orders.length;
}

async function refundOrder(tx: Tx, o: Record<string, any>, amountCents: number) {
  assertNotFrozen(o);
  const [c] = await tx`SELECT payment_intent_id FROM checkouts WHERE id = ${o.checkout_id}`;
  if (!c?.payment_intent_id) throw conflict("No payment found for this order.");
  if (o.transfer_id) {
    // Funds already left the platform: pull them back before refunding.
    await payments().reverseTransfer({ transferId: o.transfer_id, amountCents: Math.min(amountCents, o.items_cents + o.shipping_cents - o.platform_fee_cents), idempotencyKey: `reverse-${o.id}` });
  }
  const { refundId } = await payments().refund({ paymentIntentId: c.payment_intent_id, amountCents, idempotencyKey: `refund-${o.id}` });
  await tx`UPDATE orders SET status = ${transition(o.status, "refund")}, refund_id = ${refundId}, refunded_cents = ${amountCents}
           WHERE id = ${o.id}`;
  await notifyUser(tx, o.buyer_id, "refundIssued", { ...(await orderVars(tx, o.id)), amountCents }, { dedupeKey: `refund-issued:${o.id}` });
}

/** Seller can't fulfil: full refund and the listing goes back on sale. */
export async function sellerCancel(orderId: string, seller: SessionUser) {
  await sql.begin(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.seller_id !== seller.id) throw forbidden();
    const [s] = await tx`SELECT id FROM shipments WHERE order_id = ${orderId}`;
    if (s || o.status !== "paid") throw conflict("Orders can only be cancelled before they ship.");
    await refundOrder(tx, o, o.total_cents);
    await tx`UPDATE listings SET status = 'active' WHERE id IN (SELECT listing_id FROM order_items WHERE order_id = ${orderId})`;
  });
}

// ---------------------------------------------------------------- disputes

export async function openDispute(orderId: string, buyer: SessionUser, input: { reason: string; details: string }) {
  await sql.begin(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.buyer_id !== buyer.id) throw forbidden();
    const status = transition(o.status, "dispute");
    await tx`INSERT INTO disputes (order_id, opened_by, reason, details) VALUES (${orderId}, ${buyer.id}, ${input.reason}, ${input.details})`;
    await tx`UPDATE orders SET status = ${status} WHERE id = ${orderId}`;
    await notifyUser(tx, o.seller_id, "disputeOpened", await orderVars(tx, orderId), { dedupeKey: `dispute-opened:${orderId}` });
  });
  await analytics().track("Dispute opened", { path: "/account/orders", props: { reason: input.reason } });
}

export async function respondToDispute(orderId: string, seller: SessionUser, response: string) {
  const [d] = await sql`
    SELECT d.id, d.status, d.seller_response, o.seller_id FROM disputes d JOIN orders o ON o.id = d.order_id WHERE d.order_id = ${orderId}`;
  if (!d) throw notFound("No dispute on this order.");
  if (d.seller_id !== seller.id) throw forbidden();
  if (d.status !== "open" || d.seller_response) throw conflict("You've already responded to this dispute.");
  await sql`UPDATE disputes SET seller_response = ${response} WHERE id = ${d.id}`;
}

export async function resolveDispute(
  disputeId: string,
  moderator: SessionUser,
  input: { outcome: "refund" | "release"; note: string; refundCents?: number },
) {
  await sql.begin(async (tx) => {
    const [d] = await tx`SELECT * FROM disputes WHERE id = ${disputeId} FOR UPDATE`;
    if (!d) throw notFound("Dispute not found.");
    if (d.status !== "open") throw conflict("This dispute is already resolved.");
    const o = await lockOrder(tx, d.order_id);
    if (input.outcome === "refund") {
      const amount = Math.min(input.refundCents ?? o.total_cents, o.total_cents);
      if (amount <= 0) throw badRequest("Refund amount must be above zero.");
      await refundOrder(tx, o, amount);
      await tx`UPDATE disputes SET status = 'resolved_refund', refund_cents = ${amount}, resolution_note = ${input.note},
               resolved_by = ${moderator.id}, resolved_at = now() WHERE id = ${disputeId}`;
    } else {
      await releaseFunds(tx, o);
      await tx`UPDATE disputes SET status = 'resolved_release', resolution_note = ${input.note},
               resolved_by = ${moderator.id}, resolved_at = now() WHERE id = ${disputeId}`;
    }
    await tx`INSERT INTO moderation_actions (moderator_id, action, target_type, target_id, note)
             VALUES (${moderator.id}, ${`dispute_${input.outcome}`}, 'dispute', ${disputeId}, ${input.note})`;
    const vars = { ...(await orderVars(tx, o.id)), outcome: input.outcome === "refund" ? "the buyer was refunded" : "payment was released to the seller" };
    await notifyUser(tx, o.buyer_id, "disputeResolved", vars, { dedupeKey: `dispute-resolved:${disputeId}:buyer` });
    await notifyUser(tx, o.seller_id, "disputeResolved", vars, { dedupeKey: `dispute-resolved:${disputeId}:seller` });
  });
}

// ---------------------------------------------------------------- reviews

export async function leaveReview(orderId: string, buyer: SessionUser, input: { rating: number; body: string }) {
  await sql.begin(async (tx) => {
    const o = await lockOrder(tx, orderId);
    if (o.buyer_id !== buyer.id) throw forbidden("Only the buyer can review this order.");
    if (!canReview(o.status)) throw conflict("Reviews unlock once the item has been delivered.");
    const [existing] = await tx`SELECT id FROM reviews WHERE order_id = ${orderId}`;
    if (existing) throw conflict("You've already reviewed this order.");
    await tx`INSERT INTO reviews (order_id, reviewer_id, seller_id, rating, body)
             VALUES (${orderId}, ${buyer.id}, ${o.seller_id}, ${input.rating}, ${input.body})`;
  });
}

export async function sellerReviews(sellerId: string, limit = 20) {
  return sql`
    SELECT r.rating, r.body, r.created_at, u.display_name AS reviewer_name
    FROM reviews r JOIN users u ON u.id = r.reviewer_id
    WHERE r.seller_id = ${sellerId} ORDER BY r.created_at DESC LIMIT ${limit}`;
}
