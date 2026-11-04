import { describe, expect, it } from "vitest";
import { canReview, canTransition, EscrowTransitionError, inspectionWindowLapsed, isHeld, nextStatus } from "@/lib/escrow";

describe("escrow state machine", () => {
  it("follows the happy path for shipped orders", () => {
    let s = nextStatus("pending_payment", "pay");
    expect(s).toBe("paid");
    s = nextStatus(s, "ship");
    expect(s).toBe("shipped");
    s = nextStatus(s, "deliver");
    expect(s).toBe("delivered");
    s = nextStatus(s, "release");
    expect(s).toBe("completed");
  });

  it("lets pickup orders go straight from paid to delivered", () => {
    expect(nextStatus("paid", "deliver")).toBe("delivered");
  });

  it("never releases funds before delivery", () => {
    for (const s of ["pending_payment", "paid", "shipped"] as const) {
      expect(canTransition(s, "release")).toBe(false);
    }
    expect(() => nextStatus("shipped", "release")).toThrow(EscrowTransitionError);
  });

  it("freezes payout while disputed and resolves either way", () => {
    for (const s of ["paid", "shipped", "delivered"] as const) expect(nextStatus(s, "dispute")).toBe("disputed");
    expect(nextStatus("disputed", "refund")).toBe("refunded");
    expect(nextStatus("disputed", "release")).toBe("completed");
    expect(canTransition("disputed", "ship")).toBe(false);
  });

  it("treats completed, refunded and cancelled as terminal", () => {
    for (const s of ["completed", "refunded", "cancelled"] as const) {
      for (const e of ["pay", "ship", "deliver", "release", "dispute", "refund", "cancel"] as const) {
        expect(canTransition(s, e)).toBe(false);
      }
    }
  });

  it("only allows the seller to refund (cancel) before shipping", () => {
    expect(nextStatus("paid", "refund")).toBe("refunded");
    expect(canTransition("shipped", "refund")).toBe(false);
  });

  it("knows when funds are held and reviews unlock", () => {
    expect(isHeld("paid")).toBe(true);
    expect(isHeld("disputed")).toBe(true);
    expect(isHeld("completed")).toBe(false);
    expect(canReview("shipped")).toBe(false);
    expect(canReview("delivered")).toBe(true);
    expect(canReview("completed")).toBe(true);
  });

  it("computes the inspection window", () => {
    const delivered = new Date("2026-01-01T00:00:00Z");
    expect(inspectionWindowLapsed(delivered, 48, new Date("2026-01-02T23:59:00Z"))).toBe(false);
    expect(inspectionWindowLapsed(delivered, 48, new Date("2026-01-03T00:00:00Z"))).toBe(true);
    expect(inspectionWindowLapsed(null, 48)).toBe(false);
  });
});
