import Link from "next/link";
import { ORDER_STATUS_LABEL } from "@/lib/catalog";
import { formatCents } from "@/lib/money";
import { OrderStatus } from "./bits";

type Row = { id: string; status: string; total_cents: number; items_cents: number; created_at: Date; titles: string; buyer_name: string; seller_name: string; delivery_method: string };

export function OrderTable({ rows, as }: { rows: Row[]; as: "buyer" | "seller" }) {
  if (!rows.length) {
    return (
      <div className="empty glass">
        <p>{as === "buyer" ? "You haven't bought anything yet." : "No sales yet. List something and it'll show up here."}</p>
        <Link className="btn btn-primary" href={as === "buyer" ? "/shop" : "/sell"}>{as === "buyer" ? "Start shopping" : "Sell an item"}</Link>
      </div>
    );
  }
  return (
    <div className="table-wrap glass">
      <table className="table">
        <caption className="visually-hidden">{as === "buyer" ? "Your purchases" : "Your sales"}</caption>
        <thead>
          <tr>
            <th scope="col">Items</th>
            <th scope="col">{as === "buyer" ? "Seller" : "Buyer"}</th>
            <th scope="col">Date</th>
            <th scope="col">{as === "buyer" ? "Total" : "Item value"}</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id}>
              <td><Link href={`/account/orders/${o.id}`}>{o.titles}</Link></td>
              <td>{as === "buyer" ? o.seller_name : o.buyer_name}</td>
              <td>{new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td>
              <td>{formatCents(as === "buyer" ? o.total_cents : o.items_cents, true)}</td>
              <td><OrderStatus status={o.status} label={ORDER_STATUS_LABEL[o.status] ?? o.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
