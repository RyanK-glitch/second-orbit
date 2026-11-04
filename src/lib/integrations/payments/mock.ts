import { randomUUID } from "node:crypto";
import { sql } from "../../db";
import type { PaymentsAdapter } from "../types";

const rid = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;

/**
 * Local stand-in for Stripe. The "hosted" checkout page lives at
 * /mock/stripe/checkout/:checkoutId and never shows card fields: it just
 * simulates a successful test payment with a sample address.
 */
export const mockPayments: PaymentsAdapter = {
  name: "mock",

  async createCheckoutSession({ checkoutId }) {
    return { sessionId: `mock_cs_${checkoutId}`, url: `/mock/stripe/checkout/${checkoutId}` };
  },

  async getPaidSession(sessionId) {
    const checkoutId = sessionId.replace(/^mock_cs_/, "");
    const [row] = await sql`SELECT status, payment_intent_id, charge_id FROM checkouts WHERE id = ${checkoutId}`;
    if (!row || row.status !== "paid") return null;
    return { paymentIntentId: row.payment_intent_id, chargeId: row.charge_id, shipTo: null };
  },

  async createConnectedAccount() {
    return { accountId: rid("mock_acct") };
  },

  async createOnboardingLink({ accountId }) {
    return { url: `/mock/stripe/onboarding?account=${encodeURIComponent(accountId)}` };
  },

  async getAccountStatus(accountId) {
    const [row] = await sql`SELECT payouts_enabled FROM users WHERE stripe_account_id = ${accountId}`;
    return { payoutsEnabled: !!row?.payouts_enabled };
  },

  async transfer() {
    return { transferId: rid("mock_tr") };
  },

  async refund() {
    return { refundId: rid("mock_re") };
  },

  async reverseTransfer() {},

  async submitChargebackEvidence() {},
};

export const mockPaymentIds = () => ({ paymentIntentId: rid("mock_pi"), chargeId: rid("mock_ch") });
