import { logAction } from "./audit";
import { assertCan } from "./auth/permissions";
import type { SessionUser } from "./auth/session";
import { sql } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./http";

/**
 * Back-office queries and actions. Callers (pages and API routes) check the coarse
 * permission; the functions here re-check anything that depends on the target
 * (e.g. who may suspend whom) and write every change to the audit log.
 */

export const PAGE_SIZE = 20;

// ---------------------------------------------------------------- table params

export type TableParams<S extends string> = { q: string; sort: S; dir: "asc" | "desc"; page: number; filter: string };

/** Parses ?q=&sort=&dir=&page=&filter= against a whitelist of sortable columns. */
export function tableParams<S extends string>(
  sp: Record<string, string | string[] | undefined>,
  sorts: readonly S[],
  defaults: { sort: S; dir: "asc" | "desc" },
): TableParams<S> {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? "";
  const sort = (sorts as readonly string[]).includes(one("sort")) ? (one("sort") as S) : defaults.sort;
  const dir = one("dir") === "asc" ? "asc" : one("dir") === "desc" ? "desc" : defaults.dir;
  const page = Math.min(Math.max(Number.parseInt(one("page"), 10) || 1, 1), 10_000);
  return { q: one("q").trim().slice(0, 100), sort, dir, page, filter: one("filter").slice(0, 40) };
}

const like = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
type Fragment = ReturnType<typeof sql>;
/** ORDER BY from a whitelisted column fragment; user input never becomes SQL text. */
const order = (column: Fragment, dir: "asc" | "desc") => sql`${column} ${dir === "asc" ? sql`ASC` : sql`DESC`} NULLS LAST`;
const offset = (page: number) => (page - 1) * PAGE_SIZE;

// ---------------------------------------------------------------- overview

const HELD = ["paid", "shipped", "delivered", "disputed"];
const SOLD = ["paid", "shipped", "delivered", "completed", "disputed"];

export async function overview(days = 30) {
  const [[totals], daily, byCategory, byStatus] = await Promise.all([
    sql`
      SELECT
        (SELECT count(*) FROM users WHERE deleted_at IS NULL)::int AS users,
        (SELECT count(*) FROM users WHERE created_at > now() - make_interval(days => ${days}) AND deleted_at IS NULL)::int AS new_users,
        (SELECT count(*) FROM users WHERE suspended_at IS NOT NULL)::int AS suspended_users,
        (SELECT count(*) FROM listings WHERE status = 'active')::int AS active_listings,
        (SELECT count(*) FROM listings WHERE status = 'sold')::int AS sold_listings,
        (SELECT coalesce(sum(total_cents - refunded_cents), 0) FROM orders
           WHERE status = ANY(${SOLD}) AND paid_at > now() - make_interval(days => ${days}))::bigint AS gmv_cents,
        (SELECT count(*) FROM orders WHERE status = ANY(${SOLD}) AND paid_at > now() - make_interval(days => ${days}))::int AS orders,
        (SELECT coalesce(sum(total_cents - refunded_cents), 0) FROM orders WHERE status = ANY(${HELD}))::bigint AS escrow_cents,
        (SELECT coalesce(sum(platform_fee_cents + protection_fee_cents), 0) FROM orders
           WHERE status = 'completed' AND completed_at > now() - make_interval(days => ${days}))::bigint AS fees_cents,
        (SELECT count(*) FROM disputes WHERE status = 'open')::int AS open_disputes,
        (SELECT count(*) FROM reports WHERE status = 'open')::int AS open_reports`,
    sql`
      SELECT d::date AS day,
        coalesce((SELECT sum(total_cents - refunded_cents) FROM orders o
                  WHERE o.status = ANY(${SOLD}) AND o.paid_at >= d AND o.paid_at < d + interval '1 day'), 0)::bigint AS gmv_cents,
        (SELECT count(*) FROM users u WHERE u.created_at >= d AND u.created_at < d + interval '1 day')::int AS signups
      FROM generate_series(date_trunc('day', now()) - make_interval(days => ${days - 1}), date_trunc('day', now()), interval '1 day') d
      ORDER BY d`,
    sql`
      SELECT c.name AS label, count(l.id)::int AS value FROM categories c
      LEFT JOIN listings l ON l.category_id = c.id AND l.status = 'active'
      GROUP BY c.id, c.name, c.sort ORDER BY value DESC, c.sort`,
    sql`SELECT status::text AS label, count(*)::int AS value FROM orders GROUP BY status ORDER BY value DESC`,
  ]);
  type Counts = Record<"users" | "new_users" | "suspended_users" | "active_listings" | "sold_listings" | "orders" | "open_disputes" | "open_reports", number>;
  return {
    totals: { ...(totals as Counts), gmv_cents: Number(totals.gmv_cents), escrow_cents: Number(totals.escrow_cents), fees_cents: Number(totals.fees_cents) },
    daily: daily.map((d) => ({ day: d.day as Date, gmvCents: Number(d.gmv_cents), signups: d.signups as number })),
    byCategory: byCategory.map((r) => ({ label: r.label as string, value: r.value as number })),
    byStatus: byStatus.map((r) => ({ label: r.label as string, value: r.value as number })),
  };
}

// ---------------------------------------------------------------- users

export const USER_SORTS = ["created_at", "display_name", "email", "role", "listings", "orders"] as const;
const USER_ORDER: Record<(typeof USER_SORTS)[number], Fragment> = {
  created_at: sql`u.created_at`, display_name: sql`lower(u.display_name)`, email: sql`lower(u.email)`, role: sql`u.role`,
  listings: sql`listings`, orders: sql`orders`,
};
export const USER_FILTERS = ["", "user", "moderator", "admin", "suspended"] as const;

export async function listUsers(p: TableParams<(typeof USER_SORTS)[number]>) {
  const q = p.q ? sql`AND (u.email ILIKE ${like(p.q)} OR u.display_name ILIKE ${like(p.q)})` : sql``;
  const f =
    p.filter === "suspended" ? sql`AND u.suspended_at IS NOT NULL`
    : ["user", "moderator", "admin"].includes(p.filter) ? sql`AND u.role = ${p.filter}`
    : sql``;
  const rows = await sql`
    SELECT u.id, u.email, u.display_name, u.role, u.suspended_at, u.verification_status, u.created_at,
      (SELECT count(*) FROM listings l WHERE l.seller_id = u.id)::int AS listings,
      (SELECT count(*) FROM orders o WHERE o.buyer_id = u.id)::int AS orders,
      (SELECT coalesce(array_agg(provider ORDER BY provider), '{}') FROM oauth_accounts a WHERE a.user_id = u.id) AS providers,
      count(*) OVER ()::int AS total
    FROM users u WHERE true ${q} ${f}
    ORDER BY ${order(USER_ORDER[p.sort], p.dir)}, u.id
    LIMIT ${PAGE_SIZE} OFFSET ${offset(p.page)}`;
  return { rows, total: (rows[0]?.total as number) ?? 0 };
}

export async function getUserDetail(id: string) {
  const [u] = await sql`
    SELECT u.id, u.email, u.display_name, u.role, u.location, u.suspended_at, u.verification_status, u.payouts_enabled,
      u.created_at, u.email_verified_at, (u.password_hash LIKE 'scrypt$%') AS has_password,
      (SELECT count(*) FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now())::int AS active_sessions,
      (SELECT count(*) FROM listings l WHERE l.seller_id = u.id)::int AS listings,
      (SELECT count(*) FROM orders o WHERE o.buyer_id = u.id)::int AS purchases,
      (SELECT count(*) FROM orders o WHERE o.seller_id = u.id)::int AS sales,
      (SELECT count(*) FROM reports r WHERE r.target_type = 'user' AND r.target_id = u.id)::int AS reports
    FROM users u WHERE u.id = ${id}`;
  if (!u) throw notFound("User not found.");
  const [accounts, history] = await Promise.all([
    sql`SELECT provider, email, is_private_email, created_at, last_login_at FROM oauth_accounts WHERE user_id = ${id} ORDER BY provider`,
    sql`
      SELECT a.*, m.display_name AS actor_name FROM moderation_actions a JOIN users m ON m.id = a.moderator_id
      WHERE a.target_type = 'user' AND a.target_id = ${id} ORDER BY a.created_at DESC LIMIT 20`,
  ]);
  return { user: u, accounts, history };
}

type Role = SessionUser["role"];

/**
 * Role change and enable/disable. Rules: nobody edits their own account here;
 * only admins touch staff accounts or change roles; the last active admin can't be demoted or disabled.
 */
export async function updateUser(actor: SessionUser, id: string, input: { role?: Role; suspended?: boolean; note: string }) {
  if (id === actor.id) throw forbidden("You can't change your own role or status.");
  if (input.role !== undefined) assertCan(actor, "users.manage");
  await sql.begin(async (tx) => {
    const [u] = await tx`SELECT id, role, suspended_at FROM users WHERE id = ${id} FOR UPDATE`;
    if (!u) throw notFound("User not found.");
    if (u.role !== "user") assertCan(actor, "users.manage");
    else assertCan(actor, "users.suspend");

    const losesAdmin = u.role === "admin" && !u.suspended_at && ((input.role && input.role !== "admin") || input.suspended === true);
    if (losesAdmin) {
      // Serialise concurrent demotions so two admins can't remove each other at once.
      await tx`SELECT id FROM users WHERE role = 'admin' FOR UPDATE`;
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND suspended_at IS NULL AND id <> ${id}`;
      if (n === 0) throw conflict("This is the last active admin. Promote someone else first.");
    }
    if (input.role && input.role !== u.role) {
      await tx`UPDATE users SET role = ${input.role} WHERE id = ${id}`;
      await logAction(tx, { actorId: actor.id, action: "change_role", targetType: "user", targetId: id, note: input.note, details: { from: u.role, to: input.role } });
    }
    if (input.suspended !== undefined && input.suspended !== !!u.suspended_at) {
      await tx`UPDATE users SET suspended_at = ${input.suspended ? sql`now()` : null} WHERE id = ${id}`;
      if (input.suspended) await tx`DELETE FROM sessions WHERE user_id = ${id}`;
      await logAction(tx, { actorId: actor.id, action: input.suspended ? "suspend_user" : "unsuspend_user", targetType: "user", targetId: id, note: input.note });
    }
  });
}

export async function revokeSessions(actor: SessionUser, id: string, note: string) {
  if (id === actor.id) throw forbidden("Sign out from your own account menu instead.");
  const [u] = await sql`SELECT role FROM users WHERE id = ${id}`;
  if (!u) throw notFound("User not found.");
  assertCan(actor, u.role === "user" ? "users.suspend" : "users.manage");
  const res = await sql`DELETE FROM sessions WHERE user_id = ${id}`;
  await logAction(sql, { actorId: actor.id, action: "revoke_sessions", targetType: "user", targetId: id, note, details: { sessions: res.count } });
}

// ---------------------------------------------------------------- listings

export const LISTING_SORTS = ["created_at", "title", "price_cents", "status", "seller"] as const;
const LISTING_ORDER: Record<(typeof LISTING_SORTS)[number], Fragment> = {
  created_at: sql`l.created_at`, title: sql`lower(l.title)`, price_cents: sql`l.price_cents`, status: sql`l.status`, seller: sql`lower(s.display_name)`,
};
export const LISTING_FILTERS = ["", "active", "reserved", "sold", "removed", "featured"] as const;

export async function listListings(p: TableParams<(typeof LISTING_SORTS)[number]>) {
  const q = p.q ? sql`AND (l.title ILIKE ${like(p.q)} OR l.brand ILIKE ${like(p.q)} OR s.display_name ILIKE ${like(p.q)})` : sql``;
  const f =
    p.filter === "featured" ? sql`AND l.featured`
    : ["active", "reserved", "sold", "removed"].includes(p.filter) ? sql`AND l.status = ${p.filter}`
    : sql``;
  const rows = await sql`
    SELECT l.id, l.title, l.brand, l.price_cents, l.status, l.featured, l.category_id, l.created_at, l.seller_id,
      s.display_name AS seller, c.name AS category, count(*) OVER ()::int AS total
    FROM listings l JOIN users s ON s.id = l.seller_id JOIN categories c ON c.id = l.category_id
    WHERE true ${q} ${f}
    ORDER BY ${order(LISTING_ORDER[p.sort], p.dir)}, l.id
    LIMIT ${PAGE_SIZE} OFFSET ${offset(p.page)}`;
  return { rows, total: (rows[0]?.total as number) ?? 0 };
}

export async function getListingForAdmin(id: string) {
  const [l] = await sql`
    SELECT l.*, s.display_name AS seller FROM listings l JOIN users s ON s.id = l.seller_id WHERE l.id = ${id}`;
  if (!l) throw notFound("Listing not found.");
  return l;
}

export type ListingPatch = {
  title?: string;
  priceCents?: number;
  categoryId?: string;
  featured?: boolean;
  status?: "active" | "removed";
  note: string;
};

export async function updateListing(actor: SessionUser, id: string, input: ListingPatch) {
  const editsFields = input.title !== undefined || input.priceCents !== undefined || input.categoryId !== undefined || input.featured !== undefined;
  if (editsFields) assertCan(actor, "listings.edit");
  if (input.status !== undefined) assertCan(actor, "listings.moderate");
  await sql.begin(async (tx) => {
    const [l] = await tx`SELECT id, title, price_cents, category_id, featured, status, removed_reason FROM listings WHERE id = ${id} FOR UPDATE`;
    if (!l) throw notFound("Listing not found.");
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    const track = (key: string, from: unknown, to: unknown) => {
      if (to !== undefined && to !== from) changes[key] = { from, to };
    };
    track("title", l.title, input.title);
    track("price_cents", l.price_cents, input.priceCents);
    track("category_id", l.category_id, input.categoryId);
    track("featured", l.featured, input.featured);
    track("status", l.status, input.status);
    if (!Object.keys(changes).length) return;

    if (changes.status) {
      if (input.status === "removed" && !["active", "reserved"].includes(l.status)) throw conflict("Only live listings can be removed.");
      // Restoring is only for moderation removals; a seller-deleted or sold listing stays as it is.
      if (input.status === "active" && (l.status !== "removed" || !String(l.removed_reason ?? "").startsWith("moderation"))) {
        throw conflict("Only listings removed by moderation can be restored.");
      }
    }
    if (input.categoryId !== undefined) {
      const [c] = await tx`SELECT id FROM categories WHERE id = ${input.categoryId}`;
      if (!c) throw badRequest("Unknown category.", { fieldErrors: { categoryId: "Pick a category." } });
    }
    await tx`
      UPDATE listings SET
        title = ${input.title ?? l.title}, price_cents = ${input.priceCents ?? l.price_cents},
        category_id = ${input.categoryId ?? l.category_id}, featured = ${input.featured ?? l.featured},
        status = ${input.status ?? l.status},
        removed_reason = ${input.status === "removed" ? `moderation: ${input.note}` : input.status === "active" ? null : l.removed_reason},
        updated_at = now()
      WHERE id = ${id}`;
    const action = input.status === "removed" ? "remove_listing" : input.status === "active" ? "restore_listing" : "edit_listing";
    await logAction(tx, { actorId: actor.id, action, targetType: "listing", targetId: id, note: input.note, details: changes });
  });
}

// ---------------------------------------------------------------- categories

export async function listCategories() {
  return sql`
    SELECT c.*, (SELECT count(*) FROM listings l WHERE l.category_id = c.id)::int AS listings
    FROM categories c ORDER BY c.sort, c.name`;
}

export async function createCategory(actor: SessionUser, input: { id: string; name: string; blurb: string; sort: number }) {
  try {
    await sql`INSERT INTO categories (id, name, blurb, sort) VALUES (${input.id}, ${input.name}, ${input.blurb}, ${input.sort})`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw badRequest("That slug is taken.", { fieldErrors: { id: "That slug is already in use." } });
    throw e;
  }
  await logAction(sql, { actorId: actor.id, action: "create_category", targetType: "category", targetId: input.id, details: input });
}

export async function updateCategory(actor: SessionUser, id: string, input: { name: string; blurb: string; sort: number }) {
  const [before] = await sql`SELECT name, blurb, sort FROM categories WHERE id = ${id}`;
  if (!before) throw notFound("Category not found.");
  await sql`UPDATE categories SET name = ${input.name}, blurb = ${input.blurb}, sort = ${input.sort} WHERE id = ${id}`;
  await logAction(sql, { actorId: actor.id, action: "edit_category", targetType: "category", targetId: id, details: { from: before, to: input } });
}

export async function deleteCategory(actor: SessionUser, id: string) {
  const [{ n }] = await sql`SELECT count(*)::int AS n FROM listings WHERE category_id = ${id}`;
  if (n > 0) throw conflict(`This category still has ${n} listing${n === 1 ? "" : "s"}. Move them first.`);
  const res = await sql`DELETE FROM categories WHERE id = ${id}`;
  if (!res.count) throw notFound("Category not found.");
  await logAction(sql, { actorId: actor.id, action: "delete_category", targetType: "category", targetId: id });
}

// ---------------------------------------------------------------- orders

export const ORDER_SORTS = ["created_at", "total_cents", "status"] as const;
const ORDER_ORDER: Record<(typeof ORDER_SORTS)[number], Fragment> = {
  created_at: sql`o.created_at`, total_cents: sql`o.total_cents`, status: sql`o.status`,
};

export async function listOrders(p: TableParams<(typeof ORDER_SORTS)[number]>) {
  const q = p.q
    ? sql`AND (b.display_name ILIKE ${like(p.q)} OR s.display_name ILIKE ${like(p.q)} OR o.id::text LIKE ${`${p.q.toLowerCase()}%`}
              OR EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.title ILIKE ${like(p.q)}))`
    : sql``;
  const f = p.filter ? sql`AND o.status::text = ${p.filter}` : sql``;
  const rows = await sql`
    SELECT o.id, o.status, o.total_cents, o.refunded_cents, o.delivery_method, o.created_at,
      b.display_name AS buyer, s.display_name AS seller,
      (SELECT string_agg(title, ', ') FROM order_items WHERE order_id = o.id) AS titles,
      count(*) OVER ()::int AS total
    FROM orders o JOIN users b ON b.id = o.buyer_id JOIN users s ON s.id = o.seller_id
    WHERE true ${q} ${f}
    ORDER BY ${order(ORDER_ORDER[p.sort], p.dir)}, o.id
    LIMIT ${PAGE_SIZE} OFFSET ${offset(p.page)}`;
  return { rows, total: (rows[0]?.total as number) ?? 0 };
}

// ---------------------------------------------------------------- audit log

export async function listAudit(p: TableParams<"created_at">) {
  const q = p.q ? sql`AND (a.note ILIKE ${like(p.q)} OR m.display_name ILIKE ${like(p.q)} OR a.target_id = ${p.q})` : sql``;
  const f = p.filter ? sql`AND a.action = ${p.filter}` : sql``;
  const rows = await sql`
    SELECT a.*, m.display_name AS actor_name, count(*) OVER ()::int AS total
    FROM moderation_actions a JOIN users m ON m.id = a.moderator_id
    WHERE true ${q} ${f}
    ORDER BY a.created_at ${p.dir === "asc" ? sql`ASC` : sql`DESC`}, a.id
    LIMIT ${PAGE_SIZE} OFFSET ${offset(p.page)}`;
  const actions = await sql`SELECT DISTINCT action FROM moderation_actions ORDER BY action`;
  return { rows, total: (rows[0]?.total as number) ?? 0, actions: actions.map((r) => r.action as string) };
}
