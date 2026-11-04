import { randomUUID } from "node:crypto";
import { sql } from "../db";
import { getStripe } from "./stripe-client";
import type { IdentityAdapter } from "./types";

/** Stripe Identity: document + selfie check on a Stripe-hosted page. */
export const stripeIdentity: IdentityAdapter = {
  name: "stripe-identity",
  async createVerification({ userId, returnUrl }) {
    const session = await getStripe().identity.verificationSessions.create({
      type: "document",
      metadata: { userId },
      return_url: returnUrl,
      options: { document: { require_matching_selfie: true } },
    });
    if (!session.url) throw new Error("Stripe Identity did not return a URL");
    return { sessionId: session.id, url: session.url };
  },
  async getVerification(sessionId) {
    const session = await getStripe().identity.verificationSessions.retrieve(sessionId);
    if (session.status === "verified") return "verified";
    if (session.status === "requires_input" && session.last_error) return "failed";
    return "pending";
  },
};

/** Mock: /mock/identity/:sessionId lets you simulate a pass or a fail. */
export const mockIdentity: IdentityAdapter = {
  name: "mock",
  async createVerification() {
    const sessionId = `mock_vs_${randomUUID()}`;
    return { sessionId, url: `/mock/identity/${sessionId}` };
  },
  async getVerification(sessionId) {
    const [row] = await sql`SELECT verification_status FROM users WHERE identity_session_id = ${sessionId}`;
    if (row?.verification_status === "verified") return "verified";
    if (row?.verification_status === "failed") return "failed";
    return "pending";
  },
};
