import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { sql } from "@/lib/db";
import { isUuid } from "@/lib/http";
import { expireCheckout } from "@/lib/orders";

export const metadata: Metadata = { title: "Checkout cancelled", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CancelPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const { checkout } = await searchParams;
  const user = await requirePageUser("/cart");
  if (checkout && isUuid(checkout)) {
    // Release the reservation right away so the items go back on sale.
    const [c] = await sql`SELECT id FROM checkouts WHERE id = ${checkout} AND buyer_id = ${user.id} AND status = 'open'`;
    if (c) await expireCheckout(checkout);
  }
  return (
    <div className="confirm glass">
      <h1>Checkout cancelled</h1>
      <p>No payment was taken. Your items are still in your cart.</p>
      <div className="pdp-actions" style={{ justifyContent: "center" }}>
        <Link className="btn btn-primary" href="/cart">Back to cart</Link>
        <Link className="btn" href="/shop">Keep shopping</Link>
      </div>
    </div>
  );
}
