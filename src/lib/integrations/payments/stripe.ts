import type Stripe from "stripe";
import { getStripe } from "../stripe-client";
import type { Address, PaymentsAdapter } from "../types";

/**
 * Stripe Connect, "separate charges and transfers":
 *  1. Buyer pays the platform through Stripe-hosted Checkout (funds held on the platform balance).
 *  2. When delivery is confirmed we transfer the seller's share to their connected account.
 *  3. Refunds before release are plain refunds; after release we reverse the transfer first.
 */
export const stripePayments: PaymentsAdapter = {
  name: "stripe",

  async createCheckoutSession(input) {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        customer_email: input.buyerEmail,
        client_reference_id: input.checkoutId,
        line_items: input.lines.map((l) => ({
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: l.amountCents,
            product_data: { name: l.name.slice(0, 250), ...(l.imageUrl?.startsWith("https://") ? { images: [l.imageUrl] } : {}) },
          },
        })),
        ...(input.shippingRequired ? { shipping_address_collection: { allowed_countries: ["US"] } } : {}),
        payment_intent_data: {
          transfer_group: input.transferGroup,
          metadata: { checkoutId: input.checkoutId },
        },
        metadata: { checkoutId: input.checkoutId },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      },
      { idempotencyKey: `checkout-${input.checkoutId}` },
    );
    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    return { sessionId: session.id, url: session.url };
  },

  async getPaidSession(sessionId) {
    const session = await getStripe().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
    if (session.payment_status !== "paid") return null;
    const pi = session.payment_intent as Stripe.PaymentIntent | string | null;
    const paymentIntentId = typeof pi === "string" ? pi : pi?.id;
    if (!paymentIntentId) return null;
    const latest = typeof pi === "object" && pi ? pi.latest_charge : null;
    const chargeId = typeof latest === "string" ? latest : (latest?.id ?? null);
    const ship = session.collected_information?.shipping_details;
    const shipTo: Address | null = ship?.address
      ? {
          name: ship.name ?? "",
          line1: ship.address.line1 ?? "",
          line2: ship.address.line2 ?? undefined,
          city: ship.address.city ?? "",
          state: ship.address.state ?? "",
          postalCode: ship.address.postal_code ?? "",
          country: ship.address.country ?? "US",
        }
      : null;
    return { paymentIntentId, chargeId, shipTo };
  },

  async createConnectedAccount({ userId, email }) {
    // Express-style account: Stripe collects requirements and hosts the dashboard.
    const account = await getStripe().accounts.create(
      {
        country: "US",
        email,
        controller: {
          fees: { payer: "application" },
          losses: { payments: "application" },
          requirement_collection: "stripe",
          stripe_dashboard: { type: "express" },
        },
        capabilities: { transfers: { requested: true } },
        metadata: { userId },
      },
      { idempotencyKey: `acct-${userId}` },
    );
    return { accountId: account.id };
  },

  async createOnboardingLink({ accountId, returnUrl, refreshUrl }) {
    const link = await getStripe().accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      return_url: returnUrl,
      refresh_url: refreshUrl,
    });
    return { url: link.url };
  },

  async getAccountStatus(accountId) {
    const account = await getStripe().accounts.retrieve(accountId);
    return { payoutsEnabled: account.capabilities?.transfers === "active" };
  },

  async transfer({ amountCents, destination, transferGroup, sourceChargeId, idempotencyKey }) {
    const transfer = await getStripe().transfers.create(
      {
        amount: amountCents,
        currency: "usd",
        destination,
        transfer_group: transferGroup,
        // Ties the transfer to the original charge so it works before funds settle.
        ...(sourceChargeId ? { source_transaction: sourceChargeId } : {}),
      },
      { idempotencyKey },
    );
    return { transferId: transfer.id };
  },

  async refund({ paymentIntentId, amountCents, idempotencyKey }) {
    const refund = await getStripe().refunds.create(
      { payment_intent: paymentIntentId, amount: amountCents, reason: "requested_by_customer" },
      { idempotencyKey },
    );
    return { refundId: refund.id };
  },

  async reverseTransfer({ transferId, amountCents, idempotencyKey }) {
    await getStripe().transfers.createReversal(transferId, { amount: amountCents }, { idempotencyKey });
  },

  async submitChargebackEvidence({ disputeId, evidence }) {
    await getStripe().disputes.update(disputeId, { evidence, submit: true });
  },
};
