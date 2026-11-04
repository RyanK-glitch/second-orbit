import { deleteCategory, updateCategory } from "@/lib/admin";
import { requirePermission } from "@/lib/auth/session";
import { notFound, parseJson, route } from "@/lib/http";
import { categorySchema } from "../schema";

type Ctx = { params: Promise<{ id: string }> };
const slug = async (params: Ctx["params"]) => {
  const { id } = await params;
  if (!/^[a-z0-9-]{1,30}$/.test(id)) throw notFound("Category not found.");
  return id;
};

export const PATCH = route<Ctx>(async (req, { params }) => {
  const actor = await requirePermission("categories.manage");
  await updateCategory(actor, await slug(params), await parseJson(req, categorySchema));
  return { ok: true };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission("categories.manage");
  await deleteCategory(actor, await slug(params));
  return { ok: true };
});
