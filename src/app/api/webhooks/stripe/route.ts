import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { applyChargeback, parseStripeDispute } from "@/lib/chargebacks";
import { sql } from "@/lib/db";
import { config, integrations } from "@/lib/env";
import { payments } from "@/lib/integrations";
import { getStripe } from "@/lib/integrations/stripe-client";
import { completeCheckout, expireCheckout } from "@/lib/orders";
import { refreshPayouts, refreshVerification } from "@/lib/users";
import { firstDelivery, forgetDelivery } from "@/lib/webhooks";

/**
 * Stripe webhook: checkout.session.completed/expired, account.updated (Connect),
 * identity.verification_session.*, charge.dispute.* (chargebacks). Signature-verified against STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  if (integrations().payments !== "stripe" || !config.stripe.webhookSecret) {
    return NextResponse.json({ error: "Stripe webhooks are not configured." }, { status: 404 });
  }
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, req.headers.get("stripe-signature") ?? "", config.stripe.webhookSecret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (!(await firstDelivery("stripe", event.id, event.type))) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        const checkoutId = session.metadata?.checkoutId ?? session.client_reference_id;
        if (!checkoutId) break;
        const paid = await payments().getPaidSession(session.id);
        if (paid) await completeCheckout(checkoutId, paid);
        break;
      }
      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const checkoutId = session.metadata?.checkoutId ?? session.client_reference_id;
        if (checkoutId) await expireCheckout(checkoutId);
        break;
      }
      case "charge.dispute.created":
      case "charge.dispute.updated":
      case "charge.dispute.closed":
        await applyChargeback(parseStripeDispute(event.data.object as Stripe.Dispute));
        break;
      case "account.updated": {
        const account = event.data.object as Stripe.Account;
        const [u] = await sql`SELECT id FROM users WHERE stripe_account_id = ${account.id}`;
        if (u) await refreshPayouts(u.id);
        break;
      }
      case "identity.verification_session.verified":
      case "identity.verification_session.requires_input": {
        const vs = event.data.object as Stripe.Identity.VerificationSession;
        const [u] = await sql`SELECT id FROM users WHERE identity_session_id = ${vs.id}`;
        if (u) await refreshVerification(u.id);
        break;
      }
    }
  } catch (err) {
    console.error("[stripe webhook]", event.type, err);
    await forgetDelivery("stripe", event.id);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
