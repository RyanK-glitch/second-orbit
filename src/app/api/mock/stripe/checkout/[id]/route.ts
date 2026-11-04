import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { isMock } from "@/lib/env";
import { forbidden, notFound, parseJson, requireUuid, route } from "@/lib/http";
import { mockPaymentIds } from "@/lib/integrations/payments/mock";
import { completeCheckout, expireCheckout, SAMPLE_ADDRESS } from "@/lib/orders";

const schema = z.object({ outcome: z.enum(["pay", "cancel"]) });

/** Mock of Stripe's hosted checkout result. Only exists while the payments adapter is mocked. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  if (!isMock("payments")) throw notFound();
  const id = requireUuid((await params).id, "checkout");
  const user = await requireUser();
  const [c] = await sql`SELECT buyer_id, status FROM checkouts WHERE id = ${id}`;
  if (!c) throw notFound("Checkout not found.");
  if (c.buyer_id !== user.id) throw forbidden();
  const { outcome } = await parseJson(req, schema);
  if (outcome === "cancel") {
    await expireCheckout(id);
    return { redirect: `/checkout/cancel?checkout=${id}` };
  }
  await completeCheckout(id, { ...mockPaymentIds(), shipTo: { ...SAMPLE_ADDRESS, name: user.displayName } });
  return { redirect: `/checkout/success?checkout=${id}` };
});
