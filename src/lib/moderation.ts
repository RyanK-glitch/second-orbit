import { sql } from "./db";
import { badRequest, conflict, notFound } from "./http";
import type { SessionUser } from "./auth/session";

export async function createReport(
  reporter: SessionUser,
  input: { targetType: "listing" | "user" | "message"; targetId: string; reason: string; details: string },
) {
  let subjectUserId: string | null = null;
  if (input.targetType === "listing") {
    const [l] = await sql`SELECT seller_id FROM listings WHERE id = ${input.targetId}`;
    if (!l) throw notFound("Listing not found.");
    subjectUserId = l.seller_id;
  } else if (input.targetType === "user") {
    const [u] = await sql`SELECT id FROM users WHERE id = ${input.targetId}`;
    if (!u) throw notFound("User not found.");
    subjectUserId = u.id;
  } else {
    // Only participants can report a message, so reports can't be used to read others' conversations.
    const [m] = await sql`
      SELECT m.sender_id FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = ${input.targetId} AND (c.buyer_id = ${reporter.id} OR c.seller_id = ${reporter.id})`;
    if (!m) throw notFound("Message not found.");
    subjectUserId = m.sender_id;
  }
  if (subjectUserId === reporter.id) throw badRequest("You can't report yourself.");
  try {
    await sql`INSERT INTO reports (reporter_id, target_type, target_id, reason, details)
              VALUES (${reporter.id}, ${input.targetType}, ${input.targetId}, ${input.reason}, ${input.details})`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw conflict("You've already reported this. Our team is reviewing it.");
    throw e;
  }
}

/** Moderation queue: open reports with a readable summary of what was reported. */
export async function openReports() {
  return sql`
    SELECT r.*, rep.display_name AS reporter_name,
      CASE r.target_type
        WHEN 'listing' THEN (SELECT title FROM listings WHERE id = r.target_id)
        WHEN 'user' THEN (SELECT display_name FROM users WHERE id = r.target_id)
        WHEN 'message' THEN (SELECT left(body, 200) FROM messages WHERE id = r.target_id)
      END AS target_summary,
      CASE r.target_type
        WHEN 'listing' THEN (SELECT seller_id FROM listings WHERE id = r.target_id)
        WHEN 'user' THEN r.target_id
        WHEN 'message' THEN (SELECT sender_id FROM messages WHERE id = r.target_id)
      END AS subject_user_id
    FROM reports r JOIN users rep ON rep.id = r.reporter_id
    WHERE r.status = 'open' ORDER BY r.created_at`;
}

export async function openDisputes() {
  return sql`
    SELECT d.*, o.total_cents, o.status AS order_status, o.delivery_method, b.display_name AS buyer_name, s.display_name AS seller_name,
      (SELECT string_agg(title, ', ') FROM order_items WHERE order_id = o.id) AS titles,
      sh.status AS shipment_status, sh.tracking_code
    FROM disputes d JOIN orders o ON o.id = d.order_id
    JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id
    LEFT JOIN shipments sh ON sh.order_id = o.id
    WHERE d.status = 'open' ORDER BY d.created_at`;
}

export async function actOnReport(
  reportId: string,
  moderator: SessionUser,
  input: { action: "dismiss" | "remove_listing" | "suspend_user"; note: string },
) {
  await sql.begin(async (tx) => {
    const [r] = await tx`SELECT * FROM reports WHERE id = ${reportId} FOR UPDATE`;
    if (!r) throw notFound("Report not found.");
    if (r.status !== "open") throw conflict("This report has already been handled.");

    if (input.action === "remove_listing") {
      if (r.target_type !== "listing") throw badRequest("Only listing reports can remove a listing.");
      await tx`UPDATE listings SET status = 'removed', removed_reason = ${`moderation: ${input.note}`}, updated_at = now()
               WHERE id = ${r.target_id} AND status IN ('active', 'reserved')`;
    }
    if (input.action === "suspend_user") {
      const [subject] =
        r.target_type === "user"
          ? await tx`SELECT id FROM users WHERE id = ${r.target_id}`
          : r.target_type === "listing"
            ? await tx`SELECT seller_id AS id FROM listings WHERE id = ${r.target_id}`
            : await tx`SELECT sender_id AS id FROM messages WHERE id = ${r.target_id}`;
      if (!subject) throw notFound("User not found.");
      await tx`UPDATE users SET suspended_at = now() WHERE id = ${subject.id} AND role = 'user'`;
      await tx`DELETE FROM sessions WHERE user_id = ${subject.id}`;
    }
    const status = input.action === "dismiss" ? "dismissed" : "actioned";
    // Close every open report about the same target once it's been handled.
    await tx`UPDATE reports SET status = ${status}, resolved_by = ${moderator.id}, resolution_note = ${input.note}, resolved_at = now()
             WHERE target_type = ${r.target_type} AND target_id = ${r.target_id} AND status = 'open'`;
    await tx`INSERT INTO moderation_actions (moderator_id, action, target_type, target_id, note)
             VALUES (${moderator.id}, ${input.action}, ${r.target_type}, ${r.target_id}, ${input.note})`;
  });
}

export async function recentModerationActions(limit = 20) {
  return sql`
    SELECT a.*, u.display_name AS moderator_name FROM moderation_actions a JOIN users u ON u.id = a.moderator_id
    ORDER BY a.created_at DESC LIMIT ${limit}`;
}
