import type { Metadata } from "next";
import Link from "next/link";
import { Pager, SortTh, Toolbar } from "@/components/admin/Table";
import { fmtDate } from "@/components/bits";
import { LISTING_SORTS, listListings, tableParams } from "@/lib/admin";
import { requirePagePermission } from "@/lib/auth/page";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Listings", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = { active: "status-completed", reserved: "status-delivered", sold: "status-paid", removed: "status-disputed" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminListings({ searchParams }: Props) {
  await requirePagePermission("admin.view", "/admin/listings");
  const params = tableParams(await searchParams, LISTING_SORTS, { sort: "created_at", dir: "desc" });
  const { rows, total } = await listListings(params);
  const base = { path: "/admin/listings", params };
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Back office</span>
        <h1>Listings</h1>
        <p>{total} listing{total === 1 ? "" : "s"} match.</p>
      </div>
      <Toolbar {...base} placeholder="Search title, brand or seller" filters={[
        { value: "", label: "All statuses" }, { value: "active", label: "Active" }, { value: "reserved", label: "Reserved" },
        { value: "sold", label: "Sold" }, { value: "removed", label: "Removed" }, { value: "featured", label: "Featured" },
      ]} />
      <div className="table-wrap glass">
        <table className="table">
          <caption className="visually-hidden">Listings, sortable</caption>
          <thead>
            <tr>
              <SortTh {...base} column="title" label="Title" />
              <SortTh {...base} column="seller" label="Seller" />
              <th scope="col">Category</th>
              <SortTh {...base} column="price_cents" label="Price" />
              <SortTh {...base} column="status" label="Status" />
              <SortTh {...base} column="created_at" label="Listed" />
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => (
              <tr key={l.id}>
                <td className="cell-wrap"><Link href={`/admin/listings/${l.id}`}>{l.title}</Link>{l.featured && <span className="hint"> · Featured</span>}</td>
                <td><Link href={`/admin/users/${l.seller_id}`}>{l.seller}</Link></td>
                <td>{l.category}</td>
                <td>{formatCents(l.price_cents)}</td>
                <td><span className={`status ${STATUS_CLASS[l.status] ?? ""}`}>{l.status}</span></td>
                <td>{fmtDate(l.created_at)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="hint">No listings match.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager {...base} total={total} />
    </>
  );
}
