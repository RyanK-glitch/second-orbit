import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { messageSeller } from "@/lib/messaging";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/sanitize";

const messageBody = z.string().transform((s) => cleanText(s, 2000)).pipe(z.string().min(1, "Write a message."));

const schema = z.object({ listingId: z.uuid(), body: messageBody });

export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`msg:${user.id}`, 20, 60_000);
  const { listingId, body } = await parseJson(req, schema);
  return { conversationId: await messageSeller(user, listingId, body) };
});
