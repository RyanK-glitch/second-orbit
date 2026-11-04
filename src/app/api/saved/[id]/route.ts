import { requireUser } from "@/lib/auth/session";
import { requireUuid, route } from "@/lib/http";
import { setSaved } from "@/lib/listing-service";

type Ctx = { params: Promise<{ id: string }> };

export const PUT = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  await setSaved(user.id, requireUuid((await params).id, "listing"), true);
  return { saved: true };
});

export const DELETE = route<Ctx>(async (_req, { params }) => {
  const user = await requireUser();
  await setSaved(user.id, requireUuid((await params).id, "listing"), false);
  return { saved: false };
});
