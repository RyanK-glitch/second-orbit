import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { createCheckout } from "@/lib/orders";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({ listingIds: z.array(z.uuid()).min(1, "Your cart is empty.").max(20) });

/** Reserves the items and returns the Stripe-hosted (or mock) checkout URL. */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`checkout:${user.id}`, 20, 10 * 60_000);
  const { listingIds } = await parseJson(req, schema);
  const { url, checkoutId } = await createCheckout(user, listingIds);
  return { url, checkoutId };
});
