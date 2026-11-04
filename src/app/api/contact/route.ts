import { z } from "zod";
import { sql } from "@/lib/db";
import { enqueueEmail } from "@/lib/email";
import { config } from "@/lib/env";
import { isUuid, parseJson, route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { cleanLine, cleanText } from "@/lib/sanitize";

const TOPICS = ["Order problem", "Account help", "Selling", "Privacy request", "Something else"] as const;

const schema = z.object({
  name: z.string().transform((s) => cleanLine(s, 80)).pipe(z.string().min(2, "Enter your name.")),
  email: z.email("Enter a valid email address.").max(200).transform((s) => s.trim()),
  topic: z.enum(TOPICS, "Choose a topic."),
  message: z.string().transform((s) => cleanText(s, 4000)).pipe(z.string().min(10, "Tell us a little more (at least 10 characters).")),
  orderId: z.string().optional(),
});

/** Goes to the support inbox only. There's no automatic reply, so this can't be used to email strangers. */
export const POST = route(async (req) => {
  rateLimit(`contact:${clientIp(req)}`, 5, 10 * 60_000);
  const { orderId, ...input } = await parseJson(req, schema);
  await enqueueEmail(sql, config.email.support, "contactForm", { ...input, orderId: orderId && isUuid(orderId) ? orderId : null }, { replyTo: input.email });
  return { ok: true };
});
