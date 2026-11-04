import type { Metadata } from "next";
import { OrderTable } from "@/components/OrderTable";
import { requirePageUser } from "@/lib/auth/page";
import { listOrders } from "@/lib/orders";

export const metadata: Metadata = { title: "Sales" };

export default async function Sales() {
  const user = await requirePageUser("/account/sales");
  const rows = await listOrders(user.id, "seller");
  return (
    <>
      <div className="page-head"><h1>Sales</h1><p>Buy shipping labels, schedule pickups and track payouts.</p></div>
      <OrderTable rows={rows as never} as="seller" />
    </>
  );
}
