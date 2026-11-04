import { z } from "zod";
import { getUserDetail, updateUser } from "@/lib/admin";
import { requirePermission } from "@/lib/auth/session";
import { badRequest, parseJson, requireUuid, route } from "@/lib/http";
import { cleanText } from "@/lib/sanitize";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<Ctx>(async (_req, { params }) => {
  await requirePermission("admin.view");
  return getUserDetail(requireUuid((await params).id, "user"));
});

const schema = z.object({
  role: z.enum(["user", "moderator", "admin"]).optional(),
  suspended: z.boolean().optional(),
  note: z.string().transform((s) => cleanText(s, 1000)).pipe(z.string().min(3, "Add a short note for the audit log.")),
});

/** Role changes (admins) and disabling/enabling accounts (moderators for members, admins for staff). */
export const PATCH = route<Ctx>(async (req, { params }) => {
  const actor = await requirePermission("users.suspend");
  const input = await parseJson(req, schema);
  if (input.role === undefined && input.suspended === undefined) throw badRequest("Nothing to change.");
  await updateUser(actor, requireUuid((await params).id, "user"), input);
  return { ok: true };
});
