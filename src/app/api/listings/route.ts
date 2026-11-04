import { requireUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { createListing, listingInput } from "@/lib/listing-service";
import { parseFilters, searchListings } from "@/lib/listings";
import { rateLimit } from "@/lib/rate-limit";

/** Public search API: same filters as /shop (q, cat, cond, min, max, ships, sort, page). */
export const GET = route(async (req) => {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  return searchListings(parseFilters(params));
});

export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`listing:${user.id}`, 30, 60 * 60_000);
  const input = await parseJson(req, listingInput);
  const id = await createListing(user, input);
  return { id };
});
