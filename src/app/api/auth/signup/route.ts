import { z } from "zod";
import { parseJson, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { cleanLine } from "@/lib/sanitize";
import { signUp } from "@/lib/users";

const schema = z.object({
  email: z.email("Enter a valid email address.").max(200).transform((s) => s.trim()),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
  displayName: z.string().transform((s) => cleanLine(s, 60)).pipe(z.string().min(2, "Enter a name of at least 2 characters.")),
});

export const POST = route(async (req) => {
  rateLimit(`signup:${clientIp(req)}`, 10, 10 * 60_000);
  const input = await parseJson(req, schema);
  await signUp(input);
  return { ok: true };
});
