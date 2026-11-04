import type Stripe from "stripe";
import type { SessionUser } from "./auth/session";
import { logAction } from "./audit";
import { sql, type Tx } from "./db";
import { notifyUser } from "./email";
import { config } from "./env";
import { nextStatus, type OrderStatus } from "./escrow";
import { conflict, notFound } from "./http";
import { payments } from "./integrations";
import type { ChargebackEvidence } from "./integrations/types";

/**
 * Card chargebacks: the buyer disputes the charge with their bank, separately from an in-app
 * dispute, and the money leaves the platform balance straight away.
 *
 *   opened → every order on the payment is frozen (no payout, no refund)
 *   won    → orders unfreeze and carry on where they were
 *   lost   → orders become refunded. We never call refund(): the bank already returned the money,
 *            so a refund would pay the buyer twice. Sellers already paid have the transfer reversed.
 *
 * All three arrive through applyChargeback, which is idempotent and safe to receive out of order.
 */
export type ChargebackOutcome = "open" | "won" | "lost";

export type DisputeUpdate = {
  disputeId: string;
  chargeId: string | null;
  paymentIntentId: string | null;
  amountCents: number;
  reason: string;
  providerStatus: string;
  evidenceDueBy: Date | null;
};

export function parseStripeDispute(d: Stripe.Dispute): DisputeUpdate {
  const id = (v: string | { id: string } | null) => (typeof v === "string" ? v : (v?.id ?? null));
  const due = d.evidence_details?.due_by;
  return {
    disputeId: d.id,
    chargeId: id(d.charge),
    paymentIntentId: id(d.payment_intent),
    amountCents: d.amount,
    reason: d.reason,
    providerStatus: d.status,
    evidenceDueBy: due ? new Date(due * 1000) : null,
  };
}

/** Anything the bank closed without taking the money for good counts as a win for the seller. */
export function chargebackOutcome(providerStatus: string): ChargebackOutcome {
  if (providerStatus === "lost") return "lost";
  if (["won", "warning_closed", "prevented"].includes(providerStatus)) return "won";
  return "open";
}

/**
 * Splits a lost amount across the orders on a payment, in proportion to their totals. Whole cents:
 * the last order takes the rounding remainder, so the parts always add up exactly.
 */
export function allocateChargeback<T extends { total_cents: number }>(orders: T[], amountCents: number) {
  const total = orders.reduce((sum, o) => sum + o.total_cents, 0);
  const capped = Math.min(amountCents, total);
  let left = capped;
  return orders.map((order, i) => {
    const share = i === orders.length - 1 ? left : Math.floor((capped * order.total_cents) / total);
    left -= share;
    return { order, cents: share };
  });
}

export function buildEvidence(input: {
  titles: string[];
  buyerName?: string;
  buyerEmail?: string;
  carrier?: string;
  trackingCode?: string;
  shippedAt?: Date | null;
  deliveredAt?: Date | null;
  messageCount: number;
}): ChargebackEvidence {
  const lines = [
    input.deliveredAt ? `Delivery was confirmed on ${input.deliveredAt.toISOString().slice(0, 10)}.` : "Delivery has not been confirmed yet.",
    `The buyer and seller exchanged ${input.messageCount} message${input.messageCount === 1 ? "" : "s"} on the platform.`,
    "Payment was held by the platform until the buyer's inspection window ended.",
  ];
  return {
    product_description: input.titles.join(", ").slice(0, 2000),
    uncategorized_text: lines.join(" "),
    ...(input.buyerName ? { customer_name: input.buyerName } : {}),
    ...(input.buyerEmail ? { customer_email_address: input.buyerEmail } : {}),
    ...(input.carrier ? { shipping_carrier: input.carrier } : {}),
    ...(input.trackingCode ? { shipping_tracking_number: input.trackingCode } : {}),
    ...(input.shippedAt ? { shipping_date: input.shippedAt.toISOString().slice(0, 10) } : {}),
  };
}

const orderUrl = (id: string) => `${config.appUrl}/account/orders/${id}`;
const titleOf = async (tx: Tx, orderId: string) => {
  const [r] = await tx`SELECT string_agg(title, ', ') AS title FROM order_items WHERE order_id = ${orderId}`;
  return (r?.title as string) ?? "your order";
};

async function freeze(tx: Tx, chargebackId: string, checkoutId: string, cb: DisputeUpdate) {
  const orders = await tx`
    UPDATE orders SET payout_frozen_at = coalesce(payout_frozen_at, now())
    WHERE checkout_id = ${checkoutId} AND status IN ('paid', 'shipped', 'delivered', 'disputed', 'completed')
    RETURNING id, seller_id`;
  for (const o of orders) {
    await notifyUser(tx, o.seller_id, "chargebackSeller", { title: await titleOf(tx, o.id), orderUrl: orderUrl(o.id) }, { dedupeKey: `chargeback-seller:${chargebackId}:${o.id}` });
  }
  const staff = await tx`SELECT id FROM users WHERE role = 'admin' AND deleted_at IS NULL AND suspended_at IS NULL`;
  for (const s of staff) {
    await notifyUser(tx, s.id, "chargebackStaff", {
      amountCents: cb.amountCents,
      reason: cb.reason,
      dueBy: cb.evidenceDueBy?.toUTCString() ?? "not stated",
      adminUrl: `${config.appUrl}/admin/chargebacks`,
    }, { dedupeKey: `chargeback-staff:${chargebackId}:${s.id}` });
  }
}

async function applyLoss(tx: Tx, chargebackId: string, checkoutId: string, amountCents: number) {
  const orders = await tx`
    SELECT * FROM orders WHERE checkout_id = ${checkoutId} AND status IN ('paid', 'shipped', 'delivered', 'disputed', 'completed')
    ORDER BY created_at FOR UPDATE`;
  let recoveryFailed = false;
  for (const { order: o, cents } of allocateChargeback(orders as unknown as (Record<string, any> & { total_cents: number })[], amountCents)) {
    if (o.transfer_id) {
      const payout = o.items_cents + o.shipping_cents - o.platform_fee_cents;
      try {
        await payments().reverseTransfer({ transferId: o.transfer_id, amountCents: Math.min(cents, payout), idempotencyKey: `chargeback-reverse-${o.id}` });
      } catch (err) {
        // The seller may have withdrawn the money already. Record the loss anyway and flag it for staff.
        console.error("[chargeback] transfer reversal failed", o.id, (err as Error).message);
        recoveryFailed = true;
      }
    }
    await tx`
      UPDATE orders SET status = ${nextStatus(o.status as OrderStatus, "chargeback")}, refunded_cents = ${cents}, payout_frozen_at = NULL
      WHERE id = ${o.id}`;
    await tx`
      UPDATE disputes SET status = 'resolved_refund', refund_cents = ${cents}, resolved_at = now(),
        resolution_note = 'Closed automatically: the bank refunded the buyer through a card chargeback.'
      WHERE order_id = ${o.id} AND status = 'open'`;
    const vars = { title: await titleOf(tx, o.id), orderUrl: orderUrl(o.id) };
    await notifyUser(tx, o.buyer_id, "chargebackLost", vars, { dedupeKey: `chargeback-lost:${chargebackId}:${o.buyer_id}:${o.id}` });
    await notifyUser(tx, o.seller_id, "chargebackLost", vars, { dedupeKey: `chargeback-lost:${chargebackId}:${o.seller_id}:${o.id}` });
  }
  if (recoveryFailed) await tx`UPDATE chargebacks SET recovery_failed = true WHERE id = ${chargebackId}`;
}

/** Applies one webhook. Replays, and events arriving out of order, end in the same state. */
export async function applyChargeback(cb: DisputeUpdate) {
  await sql.begin(async (tx) => {
    const [checkout] = await tx`
      SELECT id FROM checkouts WHERE charge_id = ${cb.chargeId} OR payment_intent_id = ${cb.paymentIntentId} LIMIT 1 FOR UPDATE`;
    const outcome = chargebackOutcome(cb.providerStatus);
    const [existing] = await tx`SELECT id, status FROM chargebacks WHERE provider_dispute_id = ${cb.disputeId} FOR UPDATE`;
    // A closed chargeback is final: a late "updated" event must not reopen it or run the outcome twice.
    if (existing && existing.status !== "open") return;

    const closedAt = outcome === "open" ? null : new Date();
    const [row] = await tx`
      INSERT INTO chargebacks (provider_dispute_id, checkout_id, charge_id, amount_cents, reason, provider_status, status, evidence_due_by, closed_at)
      VALUES (${cb.disputeId}, ${checkout?.id ?? null}, ${cb.chargeId}, ${cb.amountCents}, ${cb.reason}, ${cb.providerStatus}, ${outcome}, ${cb.evidenceDueBy}, ${closedAt})
      ON CONFLICT (provider_dispute_id) DO UPDATE SET
        provider_status = EXCLUDED.provider_status, status = EXCLUDED.status, amount_cents = EXCLUDED.amount_cents,
        evidence_due_by = coalesce(EXCLUDED.evidence_due_by, chargebacks.evidence_due_by), closed_at = EXCLUDED.closed_at
      RETURNING id`;
    // Unknown charge: kept on the chargebacks page for staff, but there are no orders to touch.
    if (!checkout) return;

    if (outcome === "open") await freeze(tx, row.id, checkout.id, cb);
    if (outcome === "won") await tx`UPDATE orders SET payout_frozen_at = NULL WHERE checkout_id = ${checkout.id}`;
    if (outcome === "lost") await applyLoss(tx, row.id, checkout.id, cb.amountCents);
  });
}

export async function listChargebacks() {
  return sql`
    SELECT c.*, u.display_name AS buyer_name,
      (SELECT string_agg(oi.title, ', ') FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.checkout_id = c.checkout_id) AS titles,
      (SELECT min(o.id::text) FROM orders o WHERE o.checkout_id = c.checkout_id) AS order_id
    FROM chargebacks c
    LEFT JOIN checkouts k ON k.id = c.checkout_id LEFT JOIN users u ON u.id = k.buyer_id
    ORDER BY c.status = 'open' DESC, c.created_at DESC LIMIT 100`;
}

export async function submitEvidence(chargebackId: string, actor: SessionUser) {
  const [c] = await sql`SELECT * FROM chargebacks WHERE id = ${chargebackId}`;
  if (!c) throw notFound("Chargeback not found.");
  if (c.status !== "open") throw conflict("This chargeback is already closed.");
  if (c.evidence_submitted_at) throw conflict("Evidence has already been submitted. The bank only accepts it once.");
  if (!c.checkout_id) throw conflict("This charge doesn't match an order, so there's no evidence to send.");
  const orders = await sql`SELECT id, shipped_at, delivered_at FROM orders WHERE checkout_id = ${c.checkout_id}`;
  const ids = orders.map((o) => o.id as string);
  const [[buyer], items, [shipment], [messages]] = await Promise.all([
    sql`SELECT u.display_name, u.email FROM checkouts k JOIN users u ON u.id = k.buyer_id WHERE k.id = ${c.checkout_id} AND u.deleted_at IS NULL`,
    sql`SELECT title FROM order_items WHERE order_id = ANY(${ids})`,
    sql`SELECT carrier, tracking_code FROM shipments WHERE order_id = ANY(${ids}) LIMIT 1`,
    sql`
      SELECT count(*)::int AS n FROM messages m JOIN conversations v ON v.id = m.conversation_id
      WHERE v.listing_id IN (SELECT listing_id FROM order_items WHERE order_id = ANY(${ids}))
        AND v.buyer_id = (SELECT buyer_id FROM checkouts WHERE id = ${c.checkout_id})`,
  ]);
  const evidence = buildEvidence({
    titles: items.map((i) => i.title as string),
    buyerName: buyer?.display_name,
    buyerEmail: buyer?.email,
    carrier: shipment?.carrier,
    trackingCode: shipment?.tracking_code,
    shippedAt: orders[0]?.shipped_at,
    deliveredAt: orders[0]?.delivered_at,
    messageCount: messages.n,
  });
  await payments().submitChargebackEvidence({ disputeId: c.provider_dispute_id, evidence });
  await sql.begin(async (tx) => {
    await tx`UPDATE chargebacks SET evidence_submitted_at = now(), evidence_submitted_by = ${actor.id} WHERE id = ${chargebackId}`;
    await logAction(tx, { actorId: actor.id, action: "submit_chargeback_evidence", targetType: "chargeback", targetId: chargebackId });
  });
}
