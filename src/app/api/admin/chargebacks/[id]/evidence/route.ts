import { requirePermission } from "@/lib/auth/session";
import { submitEvidence } from "@/lib/chargebacks";
import { requireUuid, route } from "@/lib/http";

/** Sends the order's records to the bank. The bank accepts this only once. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const actor = await requirePermission("moderation.act");
  await submitEvidence(requireUuid((await params).id, "chargeback"), actor);
  return { ok: true };
});
