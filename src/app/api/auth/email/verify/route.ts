import { z } from "zod";
import { parseJson, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { verifyEmail } from "@/lib/users";

const schema = z.object({ token: z.string().min(20).max(100) });

/** A POST behind a button, because mail scanners open every link in a message. */
export const POST = route(async (req) => {
  rateLimit(`verify-email:${clientIp(req)}`, 20, 10 * 60_000);
  await verifyEmail((await parseJson(req, schema)).token);
  return { ok: true };
});
