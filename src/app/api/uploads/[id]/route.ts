import { requireUser } from "@/lib/auth/session";
import { requireUuid, route } from "@/lib/http";
import { deleteUpload } from "@/lib/listing-service";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  await deleteUpload(await requireUser(), requireUuid((await params).id, "photo"));
  return { ok: true };
});
