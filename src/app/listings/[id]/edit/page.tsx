import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/bits";
import { SellForm } from "@/components/SellForm";
import { requirePageUser } from "@/lib/auth/page";
import { HttpError, isUuid } from "@/lib/http";
import { getListingForEdit } from "@/lib/listing-service";
import { getCategories } from "@/lib/listings";

export const metadata: Metadata = { title: "Edit listing", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function EditListing({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requirePageUser(`/listings/${id}/edit`);
  let data: Awaited<ReturnType<typeof getListingForEdit>>;
  try {
    data = await getListingForEdit(user, id);
  } catch (e) {
    if (e instanceof HttpError) notFound();
    throw e;
  }
  const l = data.listing;
  const categories = await getCategories();
  const dollars = (c: number) => (c / 100).toFixed(2);
  return (
    <>
      <Breadcrumbs items={[{ label: "My listings", href: "/account/listings" }, { label: l.title, href: `/listings/${id}` }, { label: "Edit" }]} />
      <div className="page-head"><h1>Edit listing</h1></div>
      {l.status !== "active" && <div className="alert alert-warn"><p>This listing is {l.status} and can&apos;t be edited.</p></div>}
      <SellForm
        categories={categories}
        listingId={id}
        initial={{
          title: l.title,
          categoryId: l.category_id,
          brand: l.brand,
          condition: l.condition,
          price: dollars(l.price_cents),
          originalPrice: dollars(l.original_price_cents),
          originalNote: l.original_note,
          shipping: dollars(l.shipping_cents),
          pickupOnly: l.pickup_only,
          description: l.description,
          wearNotes: l.wear_notes,
          specs: [...Object.entries((l.specs ?? {}) as Record<string, string>).map(([key, value]) => ({ key, value })), { key: "", value: "" }],
          images: data.images,
        }}
      />
    </>
  );
}
