import { logAction } from "./audit";
import { config } from "./env";
import { sql } from "./db";
import { enqueueEmail, notifyUser } from "./email";
import { hashPassword, verifyPassword } from "./auth/password";
import { createSession, type SessionUser } from "./auth/session";
import { consumeToken, issueToken } from "./auth/tokens";
import { startChallenge } from "./auth/two-factor";
import { identity, payments } from "./integrations";
import type { Address } from "./integrations/types";
import { badRequest, conflict, forbidden, HttpError } from "./http";

export async function signUp(input: { email: string; password: string; displayName: string }) {
  const [existing] = await sql`SELECT id FROM users WHERE lower(email) = lower(${input.email})`;
  if (existing) throw conflict("An account with that email already exists. Try signing in.");
  const hash = await hashPassword(input.password);
  const u = await sql.begin(async (tx) => {
    const [row] = await tx`
      INSERT INTO users (email, password_hash, display_name) VALUES (${input.email}, ${hash}, ${input.displayName}) RETURNING id`;
    const token = await issueToken(tx, row.id, "email_verify");
    await enqueueEmail(tx, input.email, "welcome", { name: input.displayName, verifyUrl: verifyUrl(token) });
    return row;
  });
  await createSession(u.id);
  return u.id as string;
}

const verifyUrl = (token: string) => `${config.appUrl}/verify-email?token=${token}`;

// Constant-ish work for unknown emails, so response time doesn't reveal which accounts exist.
let dummyHash: Promise<string> | null = null;

export async function signIn(email: string, password: string) {
  const [u] = await sql`SELECT id, password_hash, suspended_at, totp_enabled_at FROM users WHERE lower(email) = lower(${email})`;
  if (!u) {
    dummyHash ??= hashPassword("not-a-real-password");
    await verifyPassword(password, await dummyHash);
    throw new HttpError(401, "That email and password don't match.");
  }
  if (!(await verifyPassword(password, u.password_hash))) throw new HttpError(401, "That email and password don't match.");
  if (u.suspended_at) throw forbidden("This account is suspended.");
  if (u.totp_enabled_at) {
    await startChallenge(u.id);
    return { twoFactor: true };
  }
  await createSession(u.id);
  return { twoFactor: false };
}

// ---------------------------------------------------------------- password reset & email verification

/** Always looks the same to the caller, so this can't be used to find out who has an account. */
export async function requestPasswordReset(email: string) {
  const [u] = await sql`SELECT id, email FROM users WHERE lower(email) = lower(${email}) AND deleted_at IS NULL`;
  if (!u) return;
  await sql.begin(async (tx) => {
    const token = await issueToken(tx, u.id, "password_reset");
    await enqueueEmail(tx, u.email, "passwordReset", { resetUrl: `${config.appUrl}/reset-password?token=${token}` });
  });
}

/**
 * Sets the new password and signs out every device, including whoever prompted the reset. It
 * doesn't start a session: the next sign-in still has to pass two-factor, so a stolen inbox alone
 * isn't enough. Using the link also proves the member owns the address.
 */
export async function resetPassword(token: string, password: string) {
  const hash = await hashPassword(password);
  await sql.begin(async (tx) => {
    const userId = await consumeToken(tx, token, "password_reset");
    if (!userId) throw badRequest("This reset link has expired or was already used. Please request a new one.");
    await tx`UPDATE users SET password_hash = ${hash}, email_verified_at = coalesce(email_verified_at, now()) WHERE id = ${userId}`;
    await tx`DELETE FROM sessions WHERE user_id = ${userId}`;
    await logAction(tx, { actorId: userId, action: "password_reset", targetType: "user", targetId: userId });
    await notifyUser(tx, userId, "passwordChanged", {});
  });
}

export async function sendVerificationEmail(user: SessionUser) {
  const [u] = await sql`SELECT email_verified_at FROM users WHERE id = ${user.id}`;
  if (u.email_verified_at) throw badRequest("Your email is already confirmed.");
  await sql.begin(async (tx) => {
    const token = await issueToken(tx, user.id, "email_verify");
    await enqueueEmail(tx, user.email, "verifyEmail", { verifyUrl: verifyUrl(token) });
  });
}

export async function verifyEmail(token: string) {
  await sql.begin(async (tx) => {
    const userId = await consumeToken(tx, token, "email_verify");
    if (!userId) throw badRequest("This link has expired or was already used. You can request a new one in Settings.");
    await tx`UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = ${userId}`;
  });
}

export async function updateProfile(user: SessionUser, input: { displayName: string; location: string; bio: string; shipFrom: Address | null }) {
  await sql`
    UPDATE users SET display_name = ${input.displayName}, location = ${input.location}, bio = ${input.bio},
      ship_from = ${input.shipFrom ? sql.json(input.shipFrom) : null}
    WHERE id = ${user.id}`;
}

export async function getProfile(userId: string) {
  const [u] = await sql`
    SELECT id, email, display_name, location, bio, ship_from, verification_status, payouts_enabled, stripe_account_id,
           email_verified_at, password_hash LIKE 'scrypt$%' AS has_password
    FROM users WHERE id = ${userId}`;
  return u;
}

// ---------------------------------------------------------------- seller onboarding

export async function startVerification(user: SessionUser) {
  if (user.verificationStatus === "verified") throw badRequest("You're already verified.");
  const session = await identity().createVerification({ userId: user.id, returnUrl: `${config.appUrl}/account/verification/return` });
  await sql`UPDATE users SET identity_session_id = ${session.sessionId}, verification_status = 'pending' WHERE id = ${user.id}`;
  return session.url;
}

/** Re-checks the provider (return URL + webhook both call this). */
export async function refreshVerification(userId: string) {
  const [u] = await sql`SELECT identity_session_id, verification_status FROM users WHERE id = ${userId}`;
  if (!u?.identity_session_id || u.verification_status === "verified") return u?.verification_status ?? "unverified";
  const result = await identity().getVerification(u.identity_session_id);
  if (result !== "pending") await sql`UPDATE users SET verification_status = ${result} WHERE id = ${userId}`;
  return result;
}

export async function startPayoutOnboarding(user: SessionUser) {
  let accountId = user.stripeAccountId;
  if (!accountId) {
    ({ accountId } = await payments().createConnectedAccount({ userId: user.id, email: user.email }));
    await sql`UPDATE users SET stripe_account_id = ${accountId} WHERE id = ${user.id}`;
  }
  const { url } = await payments().createOnboardingLink({
    accountId,
    returnUrl: `${config.appUrl}/account/payouts/return`,
    refreshUrl: `${config.appUrl}/account/payouts/return?refresh=1`,
  });
  return url;
}

export async function refreshPayouts(userId: string) {
  const [u] = await sql`SELECT stripe_account_id FROM users WHERE id = ${userId}`;
  if (!u?.stripe_account_id) return false;
  const { payoutsEnabled } = await payments().getAccountStatus(u.stripe_account_id);
  await sql`UPDATE users SET payouts_enabled = ${payoutsEnabled} WHERE id = ${userId}`;
  return payoutsEnabled;
}
