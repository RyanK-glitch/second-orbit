import { sql, type Tx } from "./db";
import { notifyUser } from "./email";
import { config } from "./env";
import { badRequest, conflict, forbidden, notFound } from "./http";
import type { SessionUser } from "./auth/session";

/** At most one email per conversation, per recipient, per hour: a busy chat shouldn't flood an inbox. */
async function notifyRecipient(tx: Tx, conversationId: string, recipientId: string, sender: SessionUser) {
  const [c] = await tx`SELECT l.title FROM conversations c JOIN listings l ON l.id = c.listing_id WHERE c.id = ${conversationId}`;
  const hour = Math.floor(Date.now() / 3600_000);
  await notifyUser(tx, recipientId, "newMessage", {
    senderName: sender.displayName,
    title: c.title,
    conversationUrl: `${config.appUrl}/messages/${conversationId}`,
  }, { dedupeKey: `new-message:${conversationId}:${recipientId}:${hour}` });
}

/** Starts (or continues) a buyer–seller conversation about a listing. */
export async function messageSeller(buyer: SessionUser, listingId: string, body: string) {
  const [l] = await sql`
    SELECT l.id, l.seller_id FROM listings l JOIN users u ON u.id = l.seller_id
    WHERE l.id = ${listingId} AND l.status <> 'removed' AND u.suspended_at IS NULL AND u.deleted_at IS NULL`;
  if (!l) throw notFound("Listing not found.");
  if (l.seller_id === buyer.id) throw badRequest("This is your own listing.");
  return sql.begin(async (tx) => {
    const [c] = await tx`
      INSERT INTO conversations (listing_id, buyer_id, seller_id) VALUES (${listingId}, ${buyer.id}, ${l.seller_id})
      ON CONFLICT (listing_id, buyer_id) DO UPDATE SET last_message_at = now()
      RETURNING id`;
    await tx`INSERT INTO messages (conversation_id, sender_id, body) VALUES (${c.id}, ${buyer.id}, ${body})`;
    await notifyRecipient(tx, c.id, l.seller_id, buyer);
    return c.id as string;
  });
}

async function participant(conversationId: string, user: SessionUser) {
  const [c] = await sql`SELECT * FROM conversations WHERE id = ${conversationId}`;
  if (!c) throw notFound("Conversation not found.");
  if (c.buyer_id !== user.id && c.seller_id !== user.id) throw forbidden();
  return c;
}

export async function sendMessage(conversationId: string, user: SessionUser, body: string) {
  const c = await participant(conversationId, user);
  const recipientId = c.buyer_id === user.id ? c.seller_id : c.buyer_id;
  const [recipient] = await sql`SELECT deleted_at FROM users WHERE id = ${recipientId}`;
  if (recipient.deleted_at) throw conflict("This member has deleted their account.");
  const [m] = await sql.begin(async (tx) => {
    await tx`UPDATE conversations SET last_message_at = now() WHERE id = ${conversationId}`;
    const rows = await tx`INSERT INTO messages (conversation_id, sender_id, body) VALUES (${conversationId}, ${user.id}, ${body})
              RETURNING id, sender_id, body, created_at`;
    await notifyRecipient(tx, conversationId, recipientId, user);
    return rows;
  });
  return m;
}

export async function getConversation(conversationId: string, user: SessionUser) {
  const c = await participant(conversationId, user);
  const [meta] = await sql`
    SELECT l.title AS listing_title, l.id AS listing_id, b.display_name AS buyer_name, s.display_name AS seller_name
    FROM conversations c JOIN listings l ON l.id = c.listing_id
    JOIN users b ON b.id = c.buyer_id JOIN users s ON s.id = c.seller_id WHERE c.id = ${conversationId}`;
  const messages = await sql`
    SELECT id, sender_id, body, created_at FROM messages WHERE conversation_id = ${conversationId} ORDER BY created_at LIMIT 500`;
  await sql`UPDATE messages SET read_at = now() WHERE conversation_id = ${conversationId} AND sender_id <> ${user.id} AND read_at IS NULL`;
  const otherName = c.buyer_id === user.id ? meta.seller_name : meta.buyer_name;
  const otherId = c.buyer_id === user.id ? c.seller_id : c.buyer_id;
  return { id: c.id as string, listingId: meta.listing_id as string, listingTitle: meta.listing_title as string, otherName: otherName as string, otherId: otherId as string, messages };
}

export async function listConversations(user: SessionUser) {
  return sql`
    SELECT c.id, c.last_message_at, l.title AS listing_title,
      CASE WHEN c.buyer_id = ${user.id} THEN s.display_name ELSE b.display_name END AS other_name,
      (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_body,
      (SELECT count(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id <> ${user.id} AND m.read_at IS NULL)::int AS unread
    FROM conversations c JOIN listings l ON l.id = c.listing_id
    JOIN users b ON b.id = c.buyer_id JOIN users s ON s.id = c.seller_id
    WHERE c.buyer_id = ${user.id} OR c.seller_id = ${user.id}
    ORDER BY c.last_message_at DESC LIMIT 100`;
}

export async function unreadCount(userId: string) {
  const [r] = await sql`
    SELECT count(*)::int AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
    WHERE (c.buyer_id = ${userId} OR c.seller_id = ${userId}) AND m.sender_id <> ${userId} AND m.read_at IS NULL`;
  return r.n as number;
}
