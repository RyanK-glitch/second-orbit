import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { notFound, parseJson, requireUuid, route } from "@/lib/http";
import {
  acceptPickup,
  confirmCollected,
  confirmReceipt,
  createLabel,
  leaveReview,
  openDispute,
  proposePickup,
  respondToDispute,
  sellerCancel,
  simulateTracking,
} from "@/lib/orders";
import { rateLimit } from "@/lib/rate-limit";
import { cleanLine, cleanText } from "@/lib/sanitize";

type Ctx = { params: Promise<{ id: string; action: string }> };

const pickupSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("propose"),
    startsAt: z.iso.datetime({ offset: true, local: true, message: "Choose a date and time." }).transform((s) => new Date(s)),
    location: z.string().transform((s) => cleanLine(s, 160)).pipe(z.string().min(3, "Enter a public meeting place.")),
    note: z.string().default("").transform((s) => cleanText(s, 500)),
  }),
  z.object({ op: z.literal("accept"), pickupId: z.uuid() }),
]);

const disputeSchema = z.object({
  reason: z.enum(["not_received", "not_as_described", "damaged", "counterfeit", "other"], { message: "Choose what went wrong." }),
  details: z.string().transform((s) => cleanText(s, 2000)).pipe(z.string().min(20, "Describe the problem in at least 20 characters.")),
});

const reviewSchema = z.object({
  rating: z.number().int().min(1, "Choose a rating.").max(5),
  body: z.string().default("").transform((s) => cleanText(s, 1000)),
});

const responseSchema = z.object({
  response: z.string().transform((s) => cleanText(s, 2000)).pipe(z.string().min(10, "Write at least 10 characters.")),
});

/** All buyer/seller order actions. Each service function enforces who may act and in which escrow state. */
export const POST = route<Ctx>(async (req, { params }) => {
  const { id: rawId, action } = await params;
  const id = requireUuid(rawId, "order");
  const user = await requireUser();
  rateLimit(`order:${user.id}`, 60, 60_000);

  switch (action) {
    case "label":
      return { label: await createLabel(id, user) };
    case "simulate-tracking":
      return { status: await simulateTracking(id, user) };
    case "pickup": {
      const input = await parseJson(req, pickupSchema);
      if (input.op === "propose") await proposePickup(id, user, input);
      else await acceptPickup(id, input.pickupId, user);
      return { ok: true };
    }
    case "collected":
      await confirmCollected(id, user);
      return { ok: true };
    case "confirm":
      await confirmReceipt(id, user);
      return { ok: true };
    case "cancel":
      await sellerCancel(id, user);
      return { ok: true };
    case "dispute":
      await openDispute(id, user, await parseJson(req, disputeSchema));
      return { ok: true };
    case "dispute-response":
      await respondToDispute(id, user, (await parseJson(req, responseSchema)).response);
      return { ok: true };
    case "review":
      await leaveReview(id, user, await parseJson(req, reviewSchema));
      return { ok: true };
    default:
      throw notFound("Unknown action.");
  }
});
