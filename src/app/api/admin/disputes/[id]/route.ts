import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { parseJson, requireUuid, route } from "@/lib/http";
import { resolveDispute } from "@/lib/orders";
import { cleanText } from "@/lib/sanitize";

const schema = z.object({
  outcome: z.enum(["refund", "release"]),
  note: z.string().transform((s) => cleanText(s, 1000)).pipe(z.string().min(3, "Explain the decision for both parties.")),
  refundCents: z.number().int().positive().optional(),
});

/** Moderator decision: refund the buyer (partial or full) or release escrow to the seller. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const mod = await requirePermission("moderation.act");
  await resolveDispute(requireUuid((await params).id, "dispute"), mod, await parseJson(req, schema));
  return { ok: true };
});
