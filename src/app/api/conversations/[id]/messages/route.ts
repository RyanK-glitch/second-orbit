import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { parseJson, requireUuid, route } from "@/lib/http";
import { getConversation, sendMessage } from "@/lib/messaging";
import { rateLimit } from "@/lib/rate-limit";
import { cleanText } from "@/lib/sanitize";

type Ctx = { params: Promise<{ id: string }> };
const schema = z.object({ body: z.string().transform((s) => cleanText(s, 2000)).pipe(z.string().min(1, "Write a message.")) });

/** Polled by the thread view; participants only. */
export const GET = route<Ctx>(async (_req, { params }) => {
  const c = await getConversation(requireUuid((await params).id, "conversation"), await requireUser());
  return { messages: c.messages };
});

export const POST = route<Ctx>(async (req, { params }) => {
  const user = await requireUser();
  rateLimit(`msg:${user.id}`, 20, 60_000);
  const { body } = await parseJson(req, schema);
  return sendMessage(requireUuid((await params).id, "conversation"), user, body);
});
