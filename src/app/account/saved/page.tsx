import type { Metadata } from "next";
import Link from "next/link";
import { ListingGrid } from "@/components/ListingCard";
import { requirePageUser } from "@/lib/auth/page";
import { savedListings } from "@/lib/listings";

export const metadata: Metadata = { title: "Saved items" };

export default async function Saved() {
  const user = await requirePageUser("/account/saved");
  const items = await savedListings(user.id);
  return (
    <>
      <div className="page-head"><h1>Saved items</h1><p>Items you&apos;ve saved. Sold items stay here so you can find similar ones.</p></div>
      {items.length ? <ListingGrid items={items} /> : (
        <div className="empty glass"><p>Nothing saved yet. Tap “Save” on any listing to keep it here.</p><Link className="btn btn-primary" href="/shop">Browse items</Link></div>
      )}
    </>
  );
}
