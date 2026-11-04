import { requireUser } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/users";

export const POST = route(async () => {
  const user = await requireUser();
  rateLimit(`verify-resend:${user.id}`, 3, 10 * 60_000);
  await sendVerificationEmail(user);
  return { ok: true };
});
