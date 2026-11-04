import type { Metadata } from "next";
import Link from "next/link";
import { ListingGrid } from "@/components/ListingCard";
import { requirePageUser } from "@/lib/auth/page";
import { listingsBySeller } from "@/lib/listings";

export const metadata: Metadata = { title: "My listings" };

export default async function MyListings() {
  const user = await requirePageUser("/account/listings");
  const items = await listingsBySeller(user.id, { includeInactive: true, limit: 200 });
  return (
    <>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 12, flexWrap: "wrap" }}>
        <div><h1>My listings</h1><p>Open a listing to edit or remove it.</p></div>
        <Link className="btn btn-primary" href="/sell">Sell an item</Link>
      </div>
      {items.length ? <ListingGrid items={items} /> : <div className="empty glass"><p>You haven&apos;t listed anything yet.</p></div>}
    </>
  );
}
