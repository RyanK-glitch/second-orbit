import { logAction } from "./audit";
import { verifyPassword } from "./auth/password";
import { destroySession, type SessionUser } from "./auth/session";
import { verifySecondFactor } from "./auth/two-factor";
import { sql } from "./db";
import { badRequest, conflict, forbidden, HttpError } from "./http";
import { storage } from "./integrations";
import { rateLimit } from "./rate-limit";

/** Money is held in these states, so an account can't be erased from under them. */
const OPEN_ORDER = ["paid", "shipped", "delivered", "disputed"];
const DELETED_NAME = "Deleted member";
const DELETED_MESSAGE = "[Message removed: the sender deleted their account.]";
const NO_SIGN_IN = "!deleted";

/** What a member is told before deleting, and what the server enforces. */
export async function deletionBlockers(user: Pick<SessionUser, "id" | "role">) {
  const blockers: string[] = [];
  if (user.role !== "user") blockers.push("Staff accounts can't be deleted. Ask an admin to change your role first.");
  const [r] = await sql`
    SELECT
      (SELECT count(*) FROM orders o WHERE (o.buyer_id = ${user.id} OR o.seller_id = ${user.id}) AND (
        o.status = ANY(${OPEN_ORDER})
        -- An abandoned checkout leaves a pending order behind, which shouldn't block anyone for ever.
        OR (o.status = 'pending_payment' AND EXISTS (SELECT 1 FROM checkouts k WHERE k.id = o.checkout_id AND k.status = 'open' AND k.expires_at > now()))
      ))::int AS open_orders,
      (SELECT count(*) FROM orders WHERE (buyer_id = ${user.id} OR seller_id = ${user.id}) AND payout_frozen_at IS NOT NULL)::int AS frozen_orders`;
  if (r.open_orders > 0) blockers.push(`You have ${r.open_orders} order${r.open_orders === 1 ? "" : "s"} in progress. Finish or cancel ${r.open_orders === 1 ? "it" : "them"} first.`);
  else if (r.frozen_orders > 0) blockers.push("A card chargeback is open on one of your orders. You can delete your account once the bank has decided.");
  return blockers;
}

/** Everything held about the member. Secrets (password hash, TOTP, tokens) are left out on purpose. */
export async function exportAccountData(userId: string) {
  const [[profile], linked, listings, purchases, sales, messages, reviews, reports, disputes, saved] = await Promise.all([
    sql`
      SELECT email, display_name, location, bio, role, ship_from, verification_status, payouts_enabled,
             email_verified_at, totp_enabled_at IS NOT NULL AS two_factor_enabled, created_at
      FROM users WHERE id = ${userId}`,
    sql`SELECT provider, email, created_at, last_login_at FROM oauth_accounts WHERE user_id = ${userId}`,
    sql`
      SELECT id, title, brand, description, wear_notes, condition, price_cents, original_price_cents, status, created_at
      FROM listings WHERE seller_id = ${userId} ORDER BY created_at`,
    sql`
      SELECT o.id, o.status, o.delivery_method, o.items_cents, o.shipping_cents, o.protection_fee_cents, o.total_cents,
             o.refunded_cents, o.ship_to, o.paid_at, o.shipped_at, o.delivered_at, o.completed_at, o.created_at,
             (SELECT array_agg(title) FROM order_items WHERE order_id = o.id) AS items
      FROM orders o WHERE o.buyer_id = ${userId} ORDER BY o.created_at`,
    // No ship_to here: a seller's export shouldn't contain their buyers' home addresses.
    sql`
      SELECT o.id, o.status, o.items_cents, o.shipping_cents, o.platform_fee_cents, o.refunded_cents, o.completed_at, o.created_at,
             (SELECT array_agg(title) FROM order_items WHERE order_id = o.id) AS items
      FROM orders o WHERE o.seller_id = ${userId} ORDER BY o.created_at`,
    // Only what this member wrote: replies belong to the other person.
    sql`SELECT conversation_id, body, created_at FROM messages WHERE sender_id = ${userId} ORDER BY created_at`,
    sql`SELECT order_id, rating, body, created_at FROM reviews WHERE reviewer_id = ${userId} ORDER BY created_at`,
    sql`SELECT target_type, target_id, reason, details, status, created_at FROM reports WHERE reporter_id = ${userId} ORDER BY created_at`,
    sql`SELECT order_id, reason, details, status, created_at FROM disputes WHERE opened_by = ${userId} ORDER BY created_at`,
    sql`SELECT listing_id, created_at FROM saved_items WHERE user_id = ${userId} ORDER BY created_at`,
  ]);
  return { exportedAt: new Date().toISOString(), profile, connectedAccounts: linked, listings, purchases, sales, messages, reviews, reports, disputes, savedItems: saved };
}

async function assertConfirmed(user: SessionUser, input: { password?: string; code?: string }) {
  const [u] = await sql`SELECT password_hash, totp_enabled_at FROM users WHERE id = ${user.id}`;
  const hasPassword = String(u.password_hash).startsWith("scrypt$");
  if (hasPassword && !(await verifyPassword(input.password ?? "", u.password_hash))) throw new HttpError(401, "That password isn't right.");
  if (u.totp_enabled_at && !(input.code && (await verifySecondFactor(user.id, input.code)))) {
    throw new HttpError(401, "Enter a current code from your authenticator app.");
  }
}

/**
 * GDPR/CCPA erasure. Personal data goes; the account row stays as an anonymous shell because orders
 * must be kept for tax and accounting, and the counterparty's order history still has to make
 * sense. Reviews keep their rating so a seller's score doesn't change, without the written text.
 */
export async function deleteAccount(user: SessionUser, input: { password?: string; code?: string; confirmEmail: string }) {
  rateLimit(`delete-account:${user.id}`, 5, 10 * 60_000);
  if (input.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) throw badRequest("Type your account email to confirm.");
  await assertConfirmed(user, input);

  const imageKeys = await sql.begin(async (tx) => {
    const [locked] = await tx`SELECT role, email FROM users WHERE id = ${user.id} FOR UPDATE`;
    // Checked under the lock, so a sale that lands while the form is open still stops the deletion.
    const blockers = await deletionBlockers({ id: user.id, role: locked.role });
    if (blockers.length) throw locked.role === "user" ? conflict(blockers[0]) : forbidden(blockers[0]);

    const images = await tx`
      DELETE FROM listing_images i
      WHERE i.owner_id = ${user.id} AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.listing_id = i.listing_id)
      RETURNING storage_key, thumb_key`;
    await tx`
      UPDATE listings SET status = 'removed', removed_reason = 'account deleted', updated_at = now()
      WHERE seller_id = ${user.id} AND status IN ('active', 'reserved')`;
    await tx`UPDATE messages SET body = ${DELETED_MESSAGE} WHERE sender_id = ${user.id}`;
    await tx`UPDATE reviews SET body = '' WHERE reviewer_id = ${user.id}`;
    await tx`DELETE FROM saved_items WHERE user_id = ${user.id}`;
    await tx`DELETE FROM oauth_accounts WHERE user_id = ${user.id}`;
    await tx`DELETE FROM oauth_states WHERE user_id = ${user.id}`;
    await tx`DELETE FROM account_tokens WHERE user_id = ${user.id}`;
    await tx`DELETE FROM recovery_codes WHERE user_id = ${user.id}`;
    await tx`DELETE FROM auth_challenges WHERE user_id = ${user.id}`;
    await tx`DELETE FROM email_outbox WHERE lower(to_email) = lower(${locked.email})`;
    await tx`
      UPDATE users SET email = ${`deleted-${user.id}@deleted.invalid`}, password_hash = ${NO_SIGN_IN}, display_name = ${DELETED_NAME},
        location = '', bio = '', ship_from = NULL, identity_session_id = NULL, payouts_enabled = false,
        totp_secret = NULL, totp_enabled_at = NULL, email_verified_at = NULL, deleted_at = now()
      WHERE id = ${user.id}`;
    await logAction(tx, { actorId: user.id, action: "account_deleted", targetType: "user", targetId: user.id });
    return images;
  });

  await destroySession();
  await sql`DELETE FROM sessions WHERE user_id = ${user.id}`;
  // After commit, and best effort: a leftover file is harmless, a rolled-back deletion with missing photos isn't.
  for (const key of imageKeys.flatMap((i) => [i.storage_key as string, i.thumb_key as string])) {
    await storage().delete(key).catch((err) => console.error("[account] couldn't delete", key, err));
  }
}
