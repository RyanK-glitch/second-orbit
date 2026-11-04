import { z } from "zod";
import { revokeSessions } from "@/lib/admin";
import { requirePermission } from "@/lib/auth/session";
import { parseJson, requireUuid, route } from "@/lib/http";
import { cleanText } from "@/lib/sanitize";

const schema = z.object({
  note: z.string().transform((s) => cleanText(s, 1000)).pipe(z.string().min(3, "Add a short note for the audit log.")),
});

/** Signs the user out everywhere. */
export const DELETE = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const actor = await requirePermission("users.suspend");
  const { note } = await parseJson(req, schema);
  await revokeSessions(actor, requireUuid((await params).id, "user"), note);
  return { ok: true };
});
