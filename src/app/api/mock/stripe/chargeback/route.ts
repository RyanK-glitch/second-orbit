import { z } from "zod";
import { requireModerator, requireUser } from "@/lib/auth/session";
import { applyChargeback } from "@/lib/chargebacks";
import { sql } from "@/lib/db";
import { isMock } from "@/lib/env";
import { forbidden, notFound, parseJson, route } from "@/lib/http";

const schema = z.object({ orderId: z.uuid(), status: z.enum(["needs_response", "won", "lost"]) });

/**
 * Stands in for Stripe's charge.dispute.* webhooks and calls the same code they do. The buyer can
 * "call their bank"; only staff can play the bank's decision. Only exists while payments are mocked.
 */
export const POST = route(async (req) => {
  if (!isMock("payments")) throw notFound();
  const { orderId, status } = await parseJson(req, schema);
  const [o] = await sql`
    SELECT o.buyer_id, k.id AS checkout_id, k.charge_id, k.payment_intent_id, k.total_cents
    FROM orders o JOIN checkouts k ON k.id = o.checkout_id WHERE o.id = ${orderId}`;
  if (!o) throw notFound("Order not found.");
  if (status === "needs_response") {
    if ((await requireUser()).id !== o.buyer_id) throw forbidden();
  } else {
    await requireModerator();
  }
  await applyChargeback({
    disputeId: `mock_dp_${o.checkout_id}`,
    chargeId: o.charge_id,
    paymentIntentId: o.payment_intent_id,
    amountCents: o.total_cents,
    reason: "fraudulent",
    providerStatus: status,
    evidenceDueBy: new Date(Date.now() + 7 * 864e5),
  });
  return { ok: true };
});
