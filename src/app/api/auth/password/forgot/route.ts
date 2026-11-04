import { z } from "zod";
import { parseJson, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { requestPasswordReset } from "@/lib/users";

const schema = z.object({ email: z.email("Enter a valid email address.").max(200).transform((s) => s.trim()) });

/** Same answer whether or not the address has an account. */
export const POST = route(async (req) => {
  const { email } = await parseJson(req, schema);
  rateLimit(`forgot:${clientIp(req)}`, 10, 10 * 60_000);
  rateLimit(`forgot:${email.toLowerCase()}`, 3, 10 * 60_000);
  await requestPasswordReset(email);
  return { ok: true };
});
