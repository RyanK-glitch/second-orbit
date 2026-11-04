import { z } from "zod";
import { parseJson, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { resetPassword } from "@/lib/users";

const schema = z.object({
  token: z.string().min(20).max(100),
  password: z.string().min(10, "Use at least 10 characters.").max(200),
});

export const POST = route(async (req) => {
  rateLimit(`reset:${clientIp(req)}`, 10, 10 * 60_000);
  const { token, password } = await parseJson(req, schema);
  await resetPassword(token, password);
  return { redirect: "/signin?reset=1" };
});
