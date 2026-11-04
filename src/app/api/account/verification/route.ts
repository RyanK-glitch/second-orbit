import { requireUser } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { startVerification } from "@/lib/users";

/** Starts a Stripe Identity (or mock) verification and returns the hosted URL. */
export const POST = route(async () => {
  const user = await requireUser();
  rateLimit(`verify:${user.id}`, 10, 60 * 60_000);
  return { url: await startVerification(user) };
});
