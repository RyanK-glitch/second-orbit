import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { sql } from "../db";
import { config } from "../env";
import { forbidden, unauthorized } from "../http";
import { assertCan, missingStaffTwoFactor, type Permission } from "./permissions";

export const SESSION_COOKIE = "so_session";
const SESSION_DAYS = 30;

export type SessionUser = {
  id: string;
  email: string;
  displayName: string;
  role: "user" | "moderator" | "admin";
  verificationStatus: "unverified" | "pending" | "verified" | "failed";
  payoutsEnabled: boolean;
  stripeAccountId: string | null;
  suspended: boolean;
  twoFactorEnabled: boolean;
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  await sql`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (${hashToken(token)}, ${userId}, ${expires})`;
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"),
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await sql`DELETE FROM sessions WHERE token_hash = ${hashToken(token)}`;
  jar.delete(SESSION_COOKIE);
}

/** Signs out every other device; the session making this request stays. */
export async function revokeOtherSessions(userId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? "";
  await sql`DELETE FROM sessions WHERE user_id = ${userId} AND token_hash <> ${hashToken(token)}`;
}

/** Current user for this request (memoised per request), or null. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const rows = await sql`
    SELECT u.id, u.email, u.display_name, u.role, u.verification_status, u.payouts_enabled,
           u.stripe_account_id, u.suspended_at, u.totp_enabled_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ${hashToken(token)} AND s.expires_at > now()`;
  const u = rows[0];
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    role: u.role,
    verificationStatus: u.verification_status,
    payoutsEnabled: u.payouts_enabled,
    stripeAccountId: u.stripe_account_id,
    suspended: !!u.suspended_at,
    twoFactorEnabled: !!u.totp_enabled_at,
  };
});

/** For API routes: the signed-in, non-suspended user or a 401/403. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  if (user.suspended) throw forbidden("Your account is suspended. Contact support if you think this is a mistake.");
  return user;
}

/** Staff who still need to set up two-factor sign-in. Checked before any back-office access. */
export const staffNeedsTwoFactor = (u: SessionUser) => missingStaffTwoFactor(u, config.staffTwoFactorRequired);

const assertStaffTwoFactor = (u: SessionUser) => {
  if (staffNeedsTwoFactor(u)) throw forbidden("Turn on two-factor sign-in in Settings to use the back office.");
};

export async function requireModerator(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "moderator" && user.role !== "admin") throw forbidden();
  assertStaffTwoFactor(user);
  return user;
}

/** For admin API routes: a signed-in staff member holding `permission`, or a 401/403. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  assertCan(user, permission);
  assertStaffTwoFactor(user);
  return user;
}

export const isModerator = (u: SessionUser | null) => !!u && (u.role === "moderator" || u.role === "admin");

/** Sellers must pass ID verification and connect a payout account before listing. */
export const canSell = (u: SessionUser) => u.verificationStatus === "verified" && u.payoutsEnabled;
