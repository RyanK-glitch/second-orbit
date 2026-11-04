import type { Metadata } from "next";
import Link from "next/link";
import { ClearCart } from "@/components/Cart";
import { CheckIcon } from "@/components/icons";
import { requirePageUser } from "@/lib/auth/page";
import { sql } from "@/lib/db";
import { isUuid } from "@/lib/http";
import { syncCheckout } from "@/lib/orders";

export const metadata: Metadata = { title: "Order placed", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function SuccessPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const user = await requirePageUser(`/checkout/success?checkout=${checkout ?? ""}`);
  const state = checkout && isUuid(checkout) ? await syncCheckout(checkout, user.id) : null;
  if (!state) {
    return (
      <div className="confirm glass">
        <h1>Order not found</h1>
        <Link className="btn btn-primary" href="/account/orders">View your purchases</Link>
      </div>
    );
  }
  const paid = state.status === "paid";
  const items = await sql`
    SELECT oi.listing_id FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.checkout_id = ${checkout!}`;
  return (
    <div className="confirm glass">
      {paid && <ClearCart ids={items.map((i) => i.listing_id)} />}
      <div className="confirm-icon"><CheckIcon /></div>
      <h1>{paid ? "Payment received" : "Confirming your payment…"}</h1>
      <p>
        {paid
          ? "Your money is held safely in escrow. The seller is paid only after you confirm the item arrived as described."
          : "Stripe is still confirming the payment. This usually takes a few seconds; refresh this page to check."}
      </p>
      <ul className="summary-items" style={{ textAlign: "left", margin: "24px 0" }}>
        {state.orders.map((o, i) => (
          <li key={o.id} style={{ gridTemplateColumns: "1fr auto" }}>
            <span>Order {i + 1} of {state.orders.length}</span>
            <Link href={`/account/orders/${o.id}`}>View order</Link>
          </li>
        ))}
      </ul>
      <div className="pdp-actions" style={{ justifyContent: "center" }}>
        <Link className="btn btn-primary" href={state.orders[0] ? `/account/orders/${state.orders[0].id}` : "/account/orders"}>Track your order</Link>
        <Link className="btn" href="/shop">Continue shopping</Link>
      </div>
    </div>
  );
}
