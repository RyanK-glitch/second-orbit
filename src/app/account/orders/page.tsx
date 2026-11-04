import type { Metadata } from "next";
import { OrderTable } from "@/components/OrderTable";
import { requirePageUser } from "@/lib/auth/page";
import { listOrders } from "@/lib/orders";

export const metadata: Metadata = { title: "Purchases" };

export default async function Purchases() {
  const user = await requirePageUser("/account/orders");
  const rows = await listOrders(user.id, "buyer");
  return (
    <>
      <div className="page-head"><h1>Purchases</h1><p>Track orders, confirm delivery and leave reviews.</p></div>
      <OrderTable rows={rows as never} as="buyer" />
    </>
  );
}
