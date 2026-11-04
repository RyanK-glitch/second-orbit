import { requireUser } from "@/lib/auth/session";
import { badRequest, route } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { startPayoutOnboarding } from "@/lib/users";

/** Creates the seller's Stripe Connect account (once) and returns a hosted onboarding link. */
export const POST = route(async () => {
  const user = await requireUser();
  if (user.verificationStatus !== "verified") throw badRequest("Verify your ID first.");
  rateLimit(`payouts:${user.id}`, 10, 60 * 60_000);
  return { url: await startPayoutOnboarding(user) };
});
