import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { notFound, parseJson, requireUuid, route } from "@/lib/http";
import { deleteListing, listingInput, updateListing } from "@/lib/listing-service";
import { getListing } from "@/lib/listings";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  const id = requireUuid((await params).id, "listing");
  const user = await getCurrentUser();
  const listing = await getListing(id, user?.id);
  if (!listing) throw notFound("Listing not found.");
  return listing;
});

export const PATCH = route<Ctx>(async (req, { params }) => {
  const id = requireUuid((await params).id, "listing");
  const user = await requireUser();
  await updateListing(user, id, await parseJson(req, listingInput));
  return { id };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const id = requireUuid((await params).id, "listing");
  await deleteListing(await requireUser(), id);
  return { ok: true };
});
