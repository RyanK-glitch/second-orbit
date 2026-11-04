import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { logAction } from "../../audit";
import { sql } from "../../db";
import { config, type OAuthProviderId } from "../../env";
import { safeNext } from "../../http";
import { cleanLine } from "../../sanitize";
import { createSession, getCurrentUser } from "../session";
import { hasTwoFactor, startChallenge } from "../two-factor";
import { decideNewSignIn, displayNameFor, type OAuthErrorCode } from "./policy";
import { oauthAdapter, redirectUriFor, type OAuthProfile } from "./providers";

/**
 * Authorization-code flow for every provider:
 *   start   → random state (cookie + hashed DB row), PKCE verifier, nonce → redirect to the provider
 *   callback → state must match the cookie AND an unexpired, unused row → exchange → verify → resolve account
 */

export const STATE_COOKIE = "so_oauth_state";
const STATE_TTL_MIN = 10;
// Social-only accounts get this instead of a password hash; verifyPassword() rejects anything that isn't scrypt.
export const NO_PASSWORD = "!oauth";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const random = () => randomBytes(32).toString("base64url");

export class OAuthFailure extends Error {
  constructor(public code: OAuthErrorCode, detail?: string) {
    super(detail ?? code);
  }
}

export async function startOAuth(providerId: string, opts: { intent: "signin" | "link"; next: string | null }) {
  const adapter = oauthAdapter(providerId);
  if (!adapter) throw new OAuthFailure("unavailable");
  let userId: string | null = null;
  if (opts.intent === "link") {
    const user = await getCurrentUser();
    if (!user || user.suspended) throw new OAuthFailure("link_session");
    userId = user.id;
  }
  const state = random();
  const codeVerifier = random();
  const nonce = random();
  const next = safeNext(opts.next, opts.intent === "link" ? "/account/settings" : "/");
  await sql`DELETE FROM oauth_states WHERE expires_at < now()`;
  await sql`
    INSERT INTO oauth_states (state_hash, provider, intent, user_id, code_verifier, nonce, next_path, expires_at)
    VALUES (${sha256(state)}, ${adapter.id}, ${opts.intent}, ${userId}, ${codeVerifier}, ${nonce}, ${next},
            now() + make_interval(mins => ${STATE_TTL_MIN}))`;
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // sent on the provider's top-level GET redirect back to us
    secure: config.appUrl.startsWith("https://"),
    path: "/api/auth/oauth",
    maxAge: STATE_TTL_MIN * 60,
  });
  return adapter.authorizeUrl({
    state,
    nonce,
    codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
    redirectUri: redirectUriFor(adapter.id),
  });
}

/**
 * Apple returns with a cross-site form POST, which doesn't carry our SameSite=Lax cookie.
 * Stash Apple's one-time `user` payload (the only place the name appears) on the state row,
 * then the route 303-redirects to the GET callback, where the cookie is checked as usual.
 */
export async function stashAppleUser(state: string, user: string | null) {
  if (!state || !user || user.length > 4000) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(user);
  } catch {
    return;
  }
  await sql`UPDATE oauth_states SET apple_user = ${sql.json(parsed as never)} WHERE state_hash = ${sha256(state)} AND provider = 'apple' AND expires_at > now()`;
}

export type CallbackParams = { code: string | null; state: string | null; error: string | null };

/** Returns the path to send the browser to. Never throws for expected failures. */
export async function handleCallback(providerId: string, params: CallbackParams): Promise<string> {
  const jar = await cookies();
  const cookieState = jar.get(STATE_COOKIE)?.value ?? null;
  jar.delete({ name: STATE_COOKIE, path: "/api/auth/oauth" });
  let intent: "signin" | "link" = "signin";
  let next = "/";
  try {
    // Consume the state first, even on errors, so it can never be replayed.
    const row = params.state
      ? (await sql`DELETE FROM oauth_states WHERE state_hash = ${sha256(params.state)} RETURNING *`)[0]
      : undefined;
    if (row) {
      intent = row.intent;
      next = row.next_path;
    }
    if (params.error) {
      // access_denied (Google/Facebook), user_cancelled_authorize (Apple): the person backed out.
      throw new OAuthFailure(/denied|cancel/i.test(params.error) ? "cancelled" : "failed", params.error);
    }
    if (!row || !params.state || !cookieState || cookieState !== params.state) throw new OAuthFailure("expired", "state mismatch");
    if (row.provider !== providerId || new Date(row.expires_at) < new Date()) throw new OAuthFailure("expired");
    if (!params.code) throw new OAuthFailure("failed", "missing code");
    const adapter = oauthAdapter(providerId);
    if (!adapter) throw new OAuthFailure("unavailable");

    let profile: OAuthProfile;
    try {
      profile = await adapter.exchange({
        code: params.code,
        codeVerifier: row.code_verifier,
        nonce: row.nonce,
        redirectUri: redirectUriFor(adapter.id),
        appleUser: row.apple_user,
      });
    } catch (e) {
      throw new OAuthFailure("failed", (e as Error).message);
    }

    if (row.intent === "link") {
      await linkToCurrentUser(row.user_id, profile);
      return withFlag(row.next_path, "linked", profile.provider);
    }
    const userId = await resolveSignIn(profile);
    // A social sign-in is only the first factor: it must not skip the code.
    if (await hasTwoFactor(userId)) {
      await startChallenge(userId);
      return `/signin/two-factor?next=${encodeURIComponent(row.next_path)}`;
    }
    await createSession(userId);
    return row.next_path;
  } catch (e) {
    const code = e instanceof OAuthFailure ? e.code : "failed";
    if (!(e instanceof OAuthFailure) || code === "failed") console.warn(`[oauth] ${providerId} sign-in failed:`, (e as Error).message);
    return intent === "link" ? withFlag(next, "oauth_error", code) : `/signin?${new URLSearchParams({ oauth_error: code, next })}`;
  }
}

const withFlag = (path: string, key: string, value: string) => `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

/** Finds or creates the member for a social sign-in. */
async function resolveSignIn(p: OAuthProfile): Promise<string> {
  return sql.begin(async (tx) => {
    const [linked] = await tx`
      SELECT u.id, u.suspended_at FROM oauth_accounts a JOIN users u ON u.id = a.user_id
      WHERE a.provider = ${p.provider} AND a.provider_user_id = ${p.providerUserId} FOR UPDATE OF a`;
    if (linked) {
      if (linked.suspended_at) throw new OAuthFailure("suspended");
      // Apple only includes the email on some sign-ins, so keep the last one we saw.
      await tx`
        UPDATE oauth_accounts SET last_login_at = now(), email = coalesce(${p.email}, email),
          email_verified = ${p.emailVerified} OR email_verified
        WHERE provider = ${p.provider} AND provider_user_id = ${p.providerUserId}`;
      return linked.id as string;
    }

    const [existing] = p.email ? await tx`SELECT id, role, suspended_at FROM users WHERE lower(email) = lower(${p.email}) FOR UPDATE` : [];
    const decision = decideNewSignIn(p, existing ? { id: existing.id, role: existing.role, suspended: !!existing.suspended_at } : null);
    if (decision.kind === "refuse") throw new OAuthFailure(decision.reason);

    let userId: string;
    if (decision.kind === "link") {
      userId = decision.userId;
      await tx`UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = ${userId}`;
      // The password account may have been registered by someone who never owned this inbox:
      // end every existing session so a squatter can't stay signed in once the real owner arrives.
      await tx`DELETE FROM sessions WHERE user_id = ${userId}`;
      await logAction(tx, { actorId: userId, action: "oauth_auto_link", targetType: "user", targetId: userId, details: { provider: p.provider } });
    } else {
      try {
        const [u] = await tx`
          INSERT INTO users (email, password_hash, display_name, email_verified_at)
          VALUES (${p.email}, ${NO_PASSWORD}, ${cleanLine(displayNameFor(p), 60)}, ${p.emailVerified ? sql`now()` : null})
          RETURNING id`;
        userId = u.id;
      } catch (e) {
        if ((e as { code?: string }).code === "23505") throw new OAuthFailure("email_exists");
        throw e;
      }
    }
    await tx`
      INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, email_verified, is_private_email, last_login_at)
      VALUES (${userId}, ${p.provider}, ${p.providerUserId}, ${p.email}, ${p.emailVerified}, ${p.isPrivateEmail}, now())`;
    return userId;
  });
}

/** Settings → "Connect": the state row remembers who started it, and they must still be the signed-in user. */
async function linkToCurrentUser(userId: string | null, p: OAuthProfile) {
  const current = await getCurrentUser();
  if (!userId || !current || current.id !== userId || current.suspended) throw new OAuthFailure("link_session");
  await sql.begin(async (tx) => {
    const [owner] = await tx`SELECT user_id FROM oauth_accounts WHERE provider = ${p.provider} AND provider_user_id = ${p.providerUserId}`;
    if (owner && owner.user_id !== userId) throw new OAuthFailure("already_linked");
    if (owner) return;
    const [mine] = await tx`SELECT 1 FROM oauth_accounts WHERE user_id = ${userId} AND provider = ${p.provider}`;
    if (mine) throw new OAuthFailure("already_linked", "a different account from this provider is already connected");
    await tx`
      INSERT INTO oauth_accounts (user_id, provider, provider_user_id, email, email_verified, is_private_email, last_login_at)
      VALUES (${userId}, ${p.provider}, ${p.providerUserId}, ${p.email}, ${p.emailVerified}, ${p.isPrivateEmail}, now())`;
    await logAction(tx, { actorId: userId, action: "oauth_link", targetType: "user", targetId: userId, details: { provider: p.provider } });
  });
}

export async function linkedAccounts(userId: string) {
  return sql`SELECT provider, email, is_private_email, created_at FROM oauth_accounts WHERE user_id = ${userId} ORDER BY provider`;
}

/** Disconnect, unless it's the member's only way to sign in. */
export async function unlinkProvider(userId: string, provider: OAuthProviderId) {
  await sql.begin(async (tx) => {
    const [u] = await tx`SELECT password_hash FROM users WHERE id = ${userId} FOR UPDATE`;
    const accounts = await tx`SELECT provider FROM oauth_accounts WHERE user_id = ${userId}`;
    if (!accounts.some((a) => a.provider === provider)) throw new OAuthFailure("unavailable", "not linked");
    const hasPassword = String(u.password_hash).startsWith("scrypt$");
    if (!hasPassword && accounts.length === 1) throw new OAuthFailure("unavailable", "last sign-in method");
    await tx`DELETE FROM oauth_accounts WHERE user_id = ${userId} AND provider = ${provider}`;
    await logAction(tx, { actorId: userId, action: "oauth_unlink", targetType: "user", targetId: userId, details: { provider } });
  });
}
