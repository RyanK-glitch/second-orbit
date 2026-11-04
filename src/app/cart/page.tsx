import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/bits";
import { CartView } from "@/components/CartView";
import { getCurrentUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Your cart", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const user = await getCurrentUser();
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Cart" }]} />
      <div className="page-head">
        <h1>Your cart</h1>
      </div>
      <CartView signedIn={!!user} />
    </>
  );
}
