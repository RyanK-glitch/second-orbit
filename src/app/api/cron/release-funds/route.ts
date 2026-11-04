import { timingSafeEqual } from "node:crypto";
import { config } from "@/lib/env";
import { forbidden, route } from "@/lib/http";
import { purgeOrphanUploads } from "@/lib/listing-service";
import { autoReleaseDue, sendInspectionReminders } from "@/lib/orders";
import { sql } from "@/lib/db";
import { flushOutbox } from "@/lib/email";

/**
 * Scheduled maintenance (call every ~15 min with `Authorization: Bearer $CRON_SECRET`):
 *  - release escrow for delivered orders whose inspection window lapsed,
 *  - cancel checkouts whose reservation expired,
 *  - delete photos that were uploaded but never published,
 *  - remind buyers whose inspection window is ending, retry unsent email, drop expired tokens.
 */
export const POST = route(
  async (req) => {
    const secret = config.cronSecret;
    const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) throw forbidden();
    const release = await autoReleaseDue();
    const expired = await sql`
      WITH stale AS (UPDATE checkouts SET status = 'expired' WHERE status = 'open' AND expires_at < now() RETURNING id)
      SELECT id FROM stale`;
    if (expired.length) {
      const ids = expired.map((r) => r.id);
      await sql`UPDATE orders SET status = 'cancelled' WHERE checkout_id = ANY(${ids}) AND status = 'pending_payment'`;
    }
    const purged = await purgeOrphanUploads();
    const reminders = await sendInspectionReminders();
    await sql`DELETE FROM account_tokens WHERE expires_at < now()`;
    await sql`DELETE FROM auth_challenges WHERE expires_at < now()`;
    const email = await flushOutbox(100);
    return { release, expiredCheckouts: expired.length, purgedUploads: purged, reminders, email };
  },
  { csrf: false },
);
