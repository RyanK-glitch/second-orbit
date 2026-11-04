import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { parseJson, requireUuid, route } from "@/lib/http";
import { actOnReport } from "@/lib/moderation";
import { cleanText } from "@/lib/sanitize";

const schema = z.object({
  action: z.enum(["dismiss", "remove_listing", "suspend_user"]),
  note: z.string().transform((s) => cleanText(s, 1000)).pipe(z.string().min(3, "Add a short note for the audit log.")),
});

export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const mod = await requirePermission("moderation.act");
  await actOnReport(requireUuid((await params).id, "report"), mod, await parseJson(req, schema));
  return { ok: true };
});
