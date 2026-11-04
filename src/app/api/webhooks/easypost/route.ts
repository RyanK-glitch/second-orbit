import { NextResponse } from "next/server";
import { integrations } from "@/lib/env";
import { parseEasyPostWebhook } from "@/lib/integrations/shipping";
import { applyTrackingUpdate } from "@/lib/orders";
import { firstDelivery, forgetDelivery } from "@/lib/webhooks";

/** EasyPost tracker webhooks, HMAC-validated with EASYPOST_WEBHOOK_SECRET. */
export async function POST(req: Request) {
  if (integrations().shipping !== "easypost") {
    return NextResponse.json({ error: "EasyPost webhooks are not configured." }, { status: 404 });
  }
  const raw = Buffer.from(await req.arrayBuffer());
  let parsed: ReturnType<typeof parseEasyPostWebhook>;
  try {
    parsed = parseEasyPostWebhook(raw, Object.fromEntries(req.headers));
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (!(await firstDelivery("easypost", parsed.eventId, "tracker"))) return NextResponse.json({ received: true, duplicate: true });
  try {
    if (parsed.update) await applyTrackingUpdate(parsed.update.trackingCode, parsed.update.status, parsed.update.events);
  } catch (err) {
    console.error("[easypost webhook]", err);
    await forgetDelivery("easypost", parsed.eventId);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}
