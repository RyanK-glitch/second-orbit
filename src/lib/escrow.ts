/**
 * Escrow state machine for a single order. Pure, so it is unit tested in
 * isolation; orders.ts applies it inside row-locked transactions.
 *
 *   pending_payment ─pay→ paid ─ship→ shipped ─deliver→ delivered ─release→ completed
 *         │                │                    │                 │
 *       cancel             ├─deliver (pickup)───┘                 │
 *         ↓                ├─refund (seller cancels) → refunded   │
 *     cancelled            └──────────── dispute ←────────────────┘ (from paid/shipped/delivered)
 *                                           ↓
 *                                       disputed ─refund→ refunded
 *                                                ─release→ completed
 *
 * `chargeback` is the one event that can undo a completed order: the bank has already taken the
 * money back, so it moves any paid order to refunded without a refund call of our own.
 */
export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "shipped"
  | "delivered"
  | "completed"
  | "disputed"
  | "refunded"
  | "cancelled";

export type EscrowEvent = "pay" | "cancel" | "ship" | "deliver" | "release" | "dispute" | "refund" | "chargeback";

const TRANSITIONS: Record<OrderStatus, Partial<Record<EscrowEvent, OrderStatus>>> = {
  pending_payment: { pay: "paid", cancel: "cancelled" },
  paid: { ship: "shipped", deliver: "delivered", dispute: "disputed", refund: "refunded", chargeback: "refunded" },
  shipped: { deliver: "delivered", dispute: "disputed", chargeback: "refunded" },
  delivered: { release: "completed", dispute: "disputed", chargeback: "refunded" },
  disputed: { refund: "refunded", release: "completed", chargeback: "refunded" },
  completed: { chargeback: "refunded" },
  refunded: {},
  cancelled: {},
};

export class EscrowTransitionError extends Error {
  constructor(
    public from: OrderStatus,
    public event: EscrowEvent,
  ) {
    super(`Can't ${event} an order that is ${from.replace("_", " ")}.`);
  }
}

export function nextStatus(from: OrderStatus, event: EscrowEvent): OrderStatus {
  const to = TRANSITIONS[from][event];
  if (!to) throw new EscrowTransitionError(from, event);
  return to;
}

export const canTransition = (from: OrderStatus, event: EscrowEvent) => !!TRANSITIONS[from][event];

/** Funds are held by the platform in these states. */
export const isHeld = (s: OrderStatus) => s === "paid" || s === "shipped" || s === "delivered" || s === "disputed";

/** Reviews unlock only once the buyer has the item. */
export const canReview = (s: OrderStatus) => s === "delivered" || s === "completed";

/** Has the buyer's inspection window lapsed (auto-release eligible)? */
export function inspectionWindowLapsed(deliveredAt: Date | null, windowHours: number, now = new Date()) {
  return !!deliveredAt && now.getTime() - deliveredAt.getTime() >= windowHours * 3600_000;
}
