import { z } from "zod";
import { completeChallenge } from "@/lib/auth/two-factor";
import { parseJson, route, safeNext } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const schema = z.object({ code: z.string().trim().min(6, "Enter your code.").max(20), next: z.string().max(500).optional() });

/** Second step of sign-in: trades the challenge cookie and a code for a real session. */
export const POST = route(async (req) => {
  rateLimit(`2fa-ip:${clientIp(req)}`, 30, 10 * 60_000);
  const { code, next } = await parseJson(req, schema);
  await completeChallenge(code);
  return { redirect: safeNext(next) };
});
