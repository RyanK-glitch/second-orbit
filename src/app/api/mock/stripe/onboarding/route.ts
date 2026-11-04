import { requireUser } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { isMock } from "@/lib/env";
import { badRequest, notFound, route } from "@/lib/http";

/** Mock of Connect onboarding completion: enables payouts on the caller's own mock account. */
export const POST = route(async () => {
  if (!isMock("payments")) throw notFound();
  const user = await requireUser();
  if (!user.stripeAccountId?.startsWith("mock_acct")) throw badRequest("Start payout setup from Account settings first.");
  await sql`UPDATE users SET payouts_enabled = true WHERE id = ${user.id}`;
  return { redirect: "/account/payouts/return" };
});
