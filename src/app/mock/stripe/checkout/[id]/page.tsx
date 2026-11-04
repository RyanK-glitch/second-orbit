import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { requirePageUser } from "@/lib/auth/page";
import { sql } from "@/lib/db";
import { isMock } from "@/lib/env";
import { isUuid } from "@/lib/http";
import { formatCents } from "@/lib/money";
import { SAMPLE_ADDRESS } from "@/lib/orders";

export const metadata: Metadata = { title: "Test checkout", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Local stand-in for Stripe's hosted Checkout page. Like the real thing, it
 * lives outside our app's forms, and it never asks for card details.
 */
export default async function MockCheckout({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMock("payments") || !isUuid(id)) notFound();
  const user = await requirePageUser(`/mock/stripe/checkout/${id}`);
  const [c] = await sql`SELECT * FROM checkouts WHERE id = ${id} AND buyer_id = ${user.id}`;
  if (!c) notFound();
  const items = await sql`
    SELECT oi.title, oi.price_cents FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.checkout_id = ${id}`;
  const [fees] = await sql`SELECT sum(shipping_cents)::int AS shipping, sum(protection_fee_cents)::int AS protection FROM orders WHERE checkout_id = ${id}`;
  return (
    <div className="auth-wrap" style={{ maxWidth: 560 }}>
      <div className="glass">
        <span className="eyebrow">Mock Stripe Checkout · test mode</span>
        <h1>Pay {formatCents(c.total_cents, true)}</h1>
        <div className="alert alert-info">
          <p>
            This simulates Stripe&apos;s hosted payment page. In test mode with Stripe keys set, you&apos;d be on checkout.stripe.com instead. No card details are collected here or anywhere in this app.
          </p>
        </div>
        <ul className="summary-items">
          {items.map((i, k) => (
            <li key={k} style={{ gridTemplateColumns: "1fr auto" }}><span>{i.title}</span><span>{formatCents(i.price_cents, true)}</span></li>
          ))}
          <li style={{ gridTemplateColumns: "1fr auto" }}><span>Shipping</span><span>{formatCents(fees.shipping ?? 0, true)}</span></li>
          <li style={{ gridTemplateColumns: "1fr auto" }}><span>Buyer protection</span><span>{formatCents(fees.protection ?? 0, true)}</span></li>
        </ul>
        <dl className="kv" style={{ margin: "16px 0" }}>
          <dt>Ship to (sample)</dt>
          <dd>{user.displayName}, {SAMPLE_ADDRESS.line1}, {SAMPLE_ADDRESS.city}, {SAMPLE_ADDRESS.state} {SAMPLE_ADDRESS.postalCode}</dd>
          <dt>Payment</dt>
          <dd>Simulated test payment</dd>
        </dl>
        {c.status === "open" ? (
          <div className="form-actions">
            <ActionButton endpoint={`/api/mock/stripe/checkout/${id}`} body={{ outcome: "cancel" }} className="btn btn-ghost">Cancel</ActionButton>
            <ActionButton endpoint={`/api/mock/stripe/checkout/${id}`} body={{ outcome: "pay" }} className="btn btn-primary btn-lg" pendingText="Processing…">
              Pay {formatCents(c.total_cents, true)} (test)
            </ActionButton>
          </div>
        ) : (
          <div className="alert alert-warn"><p>This checkout is {c.status}.</p></div>
        )}
      </div>
    </div>
  );
}
