import { sql } from "./db";

/** Records a provider event id; returns false if it was already processed (idempotency). */
export async function firstDelivery(provider: string, eventId: string, type: string) {
  const rows = await sql`
    INSERT INTO webhook_events (provider, event_id, type) VALUES (${provider}, ${eventId}, ${type})
    ON CONFLICT DO NOTHING RETURNING event_id`;
  return rows.length > 0;
}

/** Lets a failed handler be retried by the provider. */
export async function forgetDelivery(provider: string, eventId: string) {
  await sql`DELETE FROM webhook_events WHERE provider = ${provider} AND event_id = ${eventId}`;
}
