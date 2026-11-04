import { z } from "zod";
import { parseJson, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { signIn } from "@/lib/users";

const schema = z.object({
  email: z.string().trim().min(3, "Enter your email.").max(200),
  password: z.string().min(1, "Enter your password.").max(200),
});

export const POST = route(async (req) => {
  const input = await parseJson(req, schema);
  rateLimit(`signin:${clientIp(req)}`, 30, 10 * 60_000);
  rateLimit(`signin:${input.email.toLowerCase()}`, 10, 10 * 60_000);
  return { ok: true, ...(await signIn(input.email, input.password)) };
});
