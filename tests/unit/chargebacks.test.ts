import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { allocateChargeback, buildEvidence, chargebackOutcome, parseStripeDispute } from "@/lib/chargebacks";
import { canTransition, nextStatus, type OrderStatus } from "@/lib/escrow";

describe("chargeback outcome", () => {
  it("keeps the payout frozen while the bank is deciding", () => {
    for (const s of ["warning_needs_response", "warning_under_review", "needs_response", "under_review"]) expect(chargebackOutcome(s)).toBe("open");
  });

  it("treats every closure without a loss as a win", () => {
    for (const s of ["won", "warning_closed", "prevented"]) expect(chargebackOutcome(s)).toBe("won");
    expect(chargebackOutcome("lost")).toBe("lost");
  });
});

describe("escrow transitions for a lost chargeback", () => {
  it("refunds any order the buyer paid for, even a completed one", () => {
    for (const s of ["paid", "shipped", "delivered", "disputed", "completed"] as OrderStatus[]) expect(nextStatus(s, "chargeback")).toBe("refunded");
  });

  it("doesn't apply to orders with no money behind them, or twice", () => {
    for (const s of ["pending_payment", "cancelled", "refunded"] as OrderStatus[]) expect(canTransition(s, "chargeback")).toBe(false);
  });
});

describe("allocateChargeback", () => {
  const orders = [{ total_cents: 3333 }, { total_cents: 3333 }, { total_cents: 3334 }];
  const sum = (parts: { cents: number }[]) => parts.reduce((s, p) => s + p.cents, 0);

  it("gives each order its full total when the whole payment is lost", () => {
    expect(allocateChargeback(orders, 10000).map((p) => p.cents)).toEqual([3333, 3333, 3334]);
  });

  it("splits a partial loss by order size, with parts that add up exactly", () => {
    const parts = allocateChargeback(orders, 1000);
    expect(sum(parts)).toBe(1000);
    expect(parts.map((p) => p.cents)).toEqual([333, 333, 334]);
  });

  it("never allocates more than the orders are worth", () => {
    expect(sum(allocateChargeback(orders, 99999))).toBe(10000);
  });

  it("handles a single order and an empty list", () => {
    expect(allocateChargeback([{ total_cents: 500 }], 200)[0].cents).toBe(200);
    expect(allocateChargeback([], 200)).toEqual([]);
  });
});

describe("parseStripeDispute", () => {
  const base = { id: "dp_1", amount: 2500, reason: "fraudulent", status: "needs_response", evidence_details: { due_by: 1_800_000_000 } };

  it("reads ids whether Stripe sends them as strings or expanded objects", () => {
    const plain = parseStripeDispute({ ...base, charge: "ch_1", payment_intent: "pi_1" } as unknown as Stripe.Dispute);
    expect(plain).toMatchObject({ disputeId: "dp_1", chargeId: "ch_1", paymentIntentId: "pi_1", amountCents: 2500, evidenceDueBy: new Date(1_800_000_000_000) });
    const expanded = parseStripeDispute({ ...base, charge: { id: "ch_2" }, payment_intent: null } as unknown as Stripe.Dispute);
    expect(expanded).toMatchObject({ chargeId: "ch_2", paymentIntentId: null });
  });

  it("copes with a dispute that has no evidence deadline", () => {
    expect(parseStripeDispute({ ...base, charge: "ch_1", payment_intent: "pi_1", evidence_details: {} } as unknown as Stripe.Dispute).evidenceDueBy).toBeNull();
  });
});

describe("buildEvidence", () => {
  it("includes tracking and delivery when the order has them", () => {
    const e = buildEvidence({ titles: ["Camera", "Lens"], buyerName: "Jo", buyerEmail: "jo@example.com", carrier: "USPS", trackingCode: "TRK1", shippedAt: new Date("2026-01-02"), deliveredAt: new Date("2026-01-05"), messageCount: 1 });
    expect(e).toMatchObject({ product_description: "Camera, Lens", customer_email_address: "jo@example.com", shipping_tracking_number: "TRK1", shipping_date: "2026-01-02" });
    expect(e.uncategorized_text).toContain("confirmed on 2026-01-05");
    expect(e.uncategorized_text).toContain("exchanged 1 message on");
  });

  it("leaves out what it doesn't know, rather than sending blanks to the bank", () => {
    const e = buildEvidence({ titles: ["Chair"], messageCount: 0 });
    expect(e).not.toHaveProperty("shipping_tracking_number");
    expect(e).not.toHaveProperty("customer_email_address");
    expect(e.uncategorized_text).toContain("not been confirmed");
  });
});
