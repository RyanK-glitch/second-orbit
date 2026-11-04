import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { createReport } from "@/lib/moderation";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/sanitize";

const schema = z.object({
  targetType: z.enum(["listing", "user", "message"]),
  targetId: z.uuid(),
  reason: z.enum(["counterfeit", "misleading", "prohibited", "scam", "harassment", "spam", "other"], { message: "Choose a reason." }),
  details: z.string().nullish().transform((s) => cleanText(s ?? "", 1000)),
});

export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`report:${user.id}`, 20, 60 * 60_000);
  await createReport(user, await parseJson(req, schema));
  return { ok: true };
});
