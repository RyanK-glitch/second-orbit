import { createCategory, listCategories } from "@/lib/admin";
import { requirePermission } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { categoryIdSchema, categorySchema } from "./schema";

export const GET = route(async () => {
  await requirePermission("admin.view");
  return { items: await listCategories() };
});

export const POST = route(async (req) => {
  const actor = await requirePermission("categories.manage");
  const input = await parseJson(req, categorySchema.extend({ id: categoryIdSchema }));
  await createCategory(actor, input);
  return { ok: true };
});
