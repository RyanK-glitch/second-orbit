import { sql, type Tx } from "./db";

/**
 * Append-only audit log for staff actions and security-relevant account events.
 * Stored in `moderation_actions` (the original moderation log), so older entries stay in one place.
 */
export async function logAction(
  db: Tx | typeof sql,
  entry: { actorId: string; action: string; targetType: string; targetId: string; note?: string; details?: Record<string, unknown> },
) {
  await db`
    INSERT INTO moderation_actions (moderator_id, action, target_type, target_id, note, details)
    VALUES (${entry.actorId}, ${entry.action}, ${entry.targetType}, ${entry.targetId}, ${entry.note ?? ""}, ${db.json((entry.details ?? {}) as never)})`;
}
