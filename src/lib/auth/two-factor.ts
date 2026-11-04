import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { logAction } from "../audit";
import { APP_NAME } from "../brand";
import { sql, type Tx } from "../db";
import { notifyUser } from "../email";
import { config } from "../env";
import { badRequest, conflict, forbidden, HttpError } from "../http";
import { rateLimit } from "../rate-limit";
import { seal, unseal } from "./secret-box";
import { createSession, revokeOtherSessions, type SessionUser } from "./session";
import { base32Encode, hashRecoveryCode, matchTotp, newRecoveryCode, normalizeRecoveryCode, otpauthUri } from "./totp";

const CHALLENGE_COOKIE = "so_2fa";
const CHALLENGE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RECOVERY_CODE_COUNT = 10;

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const wrongCode = () => new HttpError(401, "That code isn't right. Check your authenticator app and try again.");

/** Checks a TOTP or unused recovery code and spends it. Runs under the row lock, so a code works once. */
async function spendCode(tx: Tx, userId: string, code: string) {
  const [u] = await tx`SELECT totp_secret, totp_last_step FROM users WHERE id = ${userId} FOR UPDATE`;
  if (!u?.totp_secret) return false;
  const clean = code.replace(/\s/g, "");
  const step = matchTotp(unseal(u.totp_secret, userId), clean, Number(u.totp_last_step));
  if (step !== null) {
    await tx`UPDATE users SET totp_last_step = ${step} WHERE id = ${userId}`;
    return true;
  }
  if (normalizeRecoveryCode(clean).length !== 10) return false;
  const used = await tx`
    UPDATE recovery_codes SET used_at = now()
    WHERE user_id = ${userId} AND code_hash = ${hashRecoveryCode(clean)} AND used_at IS NULL RETURNING user_id`;
  return used.length > 0;
}

/** For confirming a sensitive action (account deletion) as well as sign-in. */
export const verifySecondFactor = (userId: string, code: string) => sql.begin((tx) => spendCode(tx, userId, code));

// ---------------------------------------------------------------- sign-in challenge

export async function hasTwoFactor(userId: string) {
  const [u] = await sql`SELECT totp_enabled_at FROM users WHERE id = ${userId}`;
  return !!u?.totp_enabled_at;
}

/** The first factor passed. Issues a short-lived token that can only be traded for a session with a code. */
export async function startChallenge(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await sql`DELETE FROM auth_challenges WHERE expires_at < now() OR user_id = ${userId}`;
  await sql`
    INSERT INTO auth_challenges (token_hash, user_id, expires_at)
    VALUES (${sha256(token)}, ${userId}, now() + make_interval(mins => ${CHALLENGE_MINUTES}))`;
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.appUrl.startsWith("https://"),
    path: "/",
    maxAge: CHALLENGE_MINUTES * 60,
  });
}

export const hasPendingChallenge = async () => !!(await cookies()).get(CHALLENGE_COOKIE)?.value;

export async function completeChallenge(code: string) {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  const expired = () => new HttpError(401, "That sign-in attempt has expired. Please sign in again.");
  if (!token) throw expired();
  const [c] = await sql`
    UPDATE auth_challenges SET attempts = attempts + 1
    WHERE token_hash = ${sha256(token)} AND expires_at > now() AND attempts < ${MAX_ATTEMPTS}
    RETURNING user_id`;
  if (!c) {
    jar.delete(CHALLENGE_COOKIE);
    throw expired();
  }
  // Per account as well as per challenge: someone holding the password could otherwise restart forever.
  rateLimit(`2fa:${c.user_id}`, 10, 10 * 60_000);
  if (!(await verifySecondFactor(c.user_id, code))) throw wrongCode();
  await sql`DELETE FROM auth_challenges WHERE user_id = ${c.user_id}`;
  jar.delete(CHALLENGE_COOKIE);
  const [u] = await sql`SELECT suspended_at FROM users WHERE id = ${c.user_id}`;
  if (u.suspended_at) throw forbidden("This account is suspended.");
  await createSession(c.user_id);
}

// ---------------------------------------------------------------- enrolment

export async function beginEnrollment(user: SessionUser) {
  if (user.twoFactorEnabled) throw conflict("Two-factor sign-in is already on.");
  const secret = randomBytes(20);
  await sql`UPDATE users SET totp_secret = ${seal(secret, user.id)}, totp_last_step = 0 WHERE id = ${user.id}`;
  const key = base32Encode(secret);
  const uri = otpauthUri(APP_NAME, user.email, key);
  return { key, uri, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) };
}

/** A first valid code proves the app is set up. Only then does the account start requiring it. */
export async function confirmEnrollment(user: SessionUser, code: string) {
  rateLimit(`2fa-setup:${user.id}`, 10, 10 * 60_000);
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, newRecoveryCode);
  await sql.begin(async (tx) => {
    const [u] = await tx`SELECT totp_enabled_at FROM users WHERE id = ${user.id} FOR UPDATE`;
    if (u.totp_enabled_at) throw conflict("Two-factor sign-in is already on.");
    if (!(await spendCode(tx, user.id, code))) throw badRequest("That code isn't right. Check your authenticator app and try again.");
    await tx`UPDATE users SET totp_enabled_at = now() WHERE id = ${user.id}`;
    await tx`DELETE FROM recovery_codes WHERE user_id = ${user.id}`;
    for (const recovery of codes) await tx`INSERT INTO recovery_codes (user_id, code_hash) VALUES (${user.id}, ${hashRecoveryCode(recovery)})`;
    await logAction(tx, { actorId: user.id, action: "two_factor_on", targetType: "user", targetId: user.id });
    await notifyUser(tx, user.id, "twoFactorChanged", { enabled: true });
  });
  // Any session opened before this was opened without the second factor.
  await revokeOtherSessions(user.id);
  return { recoveryCodes: codes };
}

export async function disableTwoFactor(user: SessionUser, code: string) {
  if (user.role !== "user" && config.staffTwoFactorRequired) throw forbidden("Staff accounts must keep two-factor sign-in on.");
  rateLimit(`2fa-setup:${user.id}`, 10, 10 * 60_000);
  await sql.begin(async (tx) => {
    if (!(await spendCode(tx, user.id, code))) throw badRequest("That code isn't right. Check your authenticator app and try again.");
    await tx`UPDATE users SET totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = 0 WHERE id = ${user.id}`;
    await tx`DELETE FROM recovery_codes WHERE user_id = ${user.id}`;
    await logAction(tx, { actorId: user.id, action: "two_factor_off", targetType: "user", targetId: user.id });
    await notifyUser(tx, user.id, "twoFactorChanged", { enabled: false });
  });
}

export async function recoveryCodesLeft(userId: string) {
  const [r] = await sql`SELECT count(*)::int AS n FROM recovery_codes WHERE user_id = ${userId} AND used_at IS NULL`;
  return r.n as number;
}
