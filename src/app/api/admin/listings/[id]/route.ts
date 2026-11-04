import { z } from "zod";
import { updateListing } from "@/lib/admin";
import { requirePermission } from "@/lib/auth/session";
import { badRequest, parseJson, requireUuid, route } from "@/lib/http";
import { cleanLine, cleanText } from "@/lib/sanitize";

const schema = z.object({
  title: z.string().transform((s) => cleanLine(s, 120)).pipe(z.string().min(5, "Use at least 5 characters.")).optional(),
  priceCents: z.number().int().positive("Enter a price.").max(10_000_000).optional(),
  categoryId: z.string().max(40).optional(),
  featured: z.boolean().optional(),
  status: z.enum(["active", "removed"]).optional(),
  note: z.string().transform((s) => cleanText(s, 1000)).pipe(z.string().min(3, "Add a short note for the audit log.")),
});

/** Field edits need listings.edit (admins); remove/restore needs listings.moderate. Checked per field in updateListing. */
export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const actor = await requirePermission("listings.moderate");
  const input = await parseJson(req, schema);
  if (Object.keys(input).length === 1) throw badRequest("Nothing to change.");
  await updateListing(actor, requireUuid((await params).id, "listing"), input);
  return { ok: true };
});
