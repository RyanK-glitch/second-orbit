import { LISTING_SORTS, listListings, tableParams } from "@/lib/admin";
import { requirePermission } from "@/lib/auth/session";
import { route } from "@/lib/http";

export const GET = route(async (req) => {
  await requirePermission("admin.view");
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  return listListings(tableParams(sp, LISTING_SORTS, { sort: "created_at", dir: "desc" }));
});
