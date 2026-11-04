import type { Metadata } from "next";
import Link from "next/link";
import { Pager, SortTh, Toolbar } from "@/components/admin/Table";
import { fmtDate, OrderStatus } from "@/components/bits";
import { listOrders, ORDER_SORTS, tableParams } from "@/lib/admin";
import { requirePagePermission } from "@/lib/auth/page";
import { ORDER_STATUS_LABEL } from "@/lib/catalog";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Orders", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminOrders({ searchParams }: Props) {
  await requirePagePermission("admin.view", "/admin/orders");
  const params = tableParams(await searchParams, ORDER_SORTS, { sort: "created_at", dir: "desc" });
  if (params.filter && !(params.filter in ORDER_STATUS_LABEL)) params.filter = "";
  const { rows, total } = await listOrders(params);
  const base = { path: "/admin/orders", params };
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Back office</span>
        <h1>Orders</h1>
        <p>{total} order{total === 1 ? "" : "s"} match. Refunds and releases happen in the moderation queue.</p>
      </div>
      <Toolbar {...base} placeholder="Search item, buyer, seller or order id"
        filters={[{ value: "", label: "All statuses" }, ...Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => ({ value, label }))]} />
      <div className="table-wrap glass">
        <table className="table">
          <caption className="visually-hidden">Orders, sortable</caption>
          <thead>
            <tr>
              <th scope="col">Items</th>
              <th scope="col">Buyer → seller</th>
              <SortTh {...base} column="total_cents" label="Total" />
              <SortTh {...base} column="status" label="Status" />
              <SortTh {...base} column="created_at" label="Created" />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id}>
                <td className="cell-wrap"><Link href={`/account/orders/${o.id}`}>{o.titles}</Link></td>
                <td>{o.buyer} → {o.seller}</td>
                <td>{formatCents(o.total_cents, true)}{o.refunded_cents > 0 && <span className="hint"> ({formatCents(o.refunded_cents, true)} refunded)</span>}</td>
                <td><OrderStatus status={o.status} label={ORDER_STATUS_LABEL[o.status] ?? o.status} /></td>
                <td>{fmtDate(o.created_at)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="hint">No orders match.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager {...base} total={total} />
    </>
  );
}
