import { overview } from "@/lib/admin";
import { requirePermission } from "@/lib/auth/session";
import { route } from "@/lib/http";

export const GET = route(async () => {
  await requirePermission("admin.view");
  return overview();
});
