import { createHmac } from "node:crypto";
import { config, oauthProviders, type OAuthProviderId } from "../../env";
import { appleClientSecret, TokenError, verifyIdToken } from "./jwt";

/** What we keep from any provider after the code exchange. */
export type OAuthProfile = {
  provider: OAuthProviderId;
  providerUserId: string;
  email: string | null;
  /** The provider vouches that this person controls the address. */
  emailVerified: boolean;
  /** Apple "Hide My Email" relay address. */
  isPrivateEmail: boolean;
  name: string | null;
};

export type AuthorizeInput = { state: string; nonce: string; codeChallenge: string; redirectUri: string };
export type ExchangeInput = { code: string; codeVerifier: string; nonce: string; redirectUri: string; appleUser?: unknown };

export interface OAuthAdapter {
  id: OAuthProviderId;
  label: string;
  authorizeUrl(input: AuthorizeInput): string;
  exchange(input: ExchangeInput): Promise<OAuthProfile>;
}

export const PROVIDER_LABEL: Record<OAuthProviderId, string> = { google: "Google", apple: "Apple", facebook: "Facebook" };

export class ProviderError extends Error {}

async function postForm(url: string, body: Record<string, string>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ProviderError(`Token exchange failed (${res.status}${json.error ? `: ${json.error}` : ""}).`);
  return json;
}

const truthy = (v: unknown) => v === true || v === "true";

// ---------------------------------------------------------------- Google (OpenID Connect)

const google: OAuthAdapter = {
  id: "google",
  label: "Google",
  authorizeUrl: ({ state, nonce, codeChallenge, redirectUri }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: config.oauth.google.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    })}`,
  async exchange({ code, codeVerifier, nonce, redirectUri }) {
    const tokens = await postForm("https://oauth2.googleapis.com/token", {
      code,
      client_id: config.oauth.google.clientId,
      client_secret: config.oauth.google.clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    });
    if (typeof tokens.id_token !== "string") throw new ProviderError("Google didn't return an ID token.");
    const c = await verifyIdToken(tokens.id_token, {
      jwksUrl: "https://www.googleapis.com/oauth2/v3/certs",
      issuers: ["https://accounts.google.com", "accounts.google.com"],
      audience: config.oauth.google.clientId,
      nonce,
    });
    return {
      provider: "google",
      providerUserId: c.sub,
      email: typeof c.email === "string" ? c.email : null,
      emailVerified: truthy(c.email_verified),
      isPrivateEmail: false,
      name: typeof c.name === "string" ? c.name : null,
    };
  },
};

// ---------------------------------------------------------------- Apple (Sign in with Apple)

/** Apple posts `user` (JSON, first consent only) alongside the code; it's the only place the name ever appears. */
export function appleNameFromUser(user: unknown): string | null {
  let u = user;
  if (typeof u === "string") {
    try {
      u = JSON.parse(u);
    } catch {
      return null;
    }
  }
  const name = (u as { name?: { firstName?: unknown; lastName?: unknown } } | null)?.name;
  const parts = [name?.firstName, name?.lastName].filter((p): p is string => typeof p === "string" && p.trim() !== "");
  return parts.length ? parts.join(" ") : null;
}

export const isAppleRelay = (email: string | null) => !!email && /@privaterelay\.appleid\.com$/i.test(email);

export function appleProfile(claims: Record<string, unknown>, appleUser: unknown): OAuthProfile {
  const email = typeof claims.email === "string" ? claims.email : null;
  return {
    provider: "apple",
    providerUserId: String(claims.sub),
    email,
    // Apple sends these as booleans or as the strings "true"/"false".
    emailVerified: truthy(claims.email_verified),
    isPrivateEmail: truthy(claims.is_private_email) || isAppleRelay(email),
    name: appleNameFromUser(appleUser),
  };
}

const apple: OAuthAdapter = {
  id: "apple",
  label: "Apple",
  // Apple doesn't support PKCE; state (browser-bound) + nonce (in the ID token) protect the flow.
  authorizeUrl: ({ state, nonce, redirectUri }) =>
    `https://appleid.apple.com/auth/authorize?${new URLSearchParams({
      client_id: config.oauth.apple.clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      response_mode: "form_post", // required when asking for name/email
      scope: "name email",
      state,
      nonce,
    })}`,
  async exchange({ code, nonce, redirectUri, appleUser }) {
    const a = config.oauth.apple;
    const tokens = await postForm("https://appleid.apple.com/auth/token", {
      code,
      client_id: a.clientId,
      client_secret: appleClientSecret({ teamId: a.teamId, clientId: a.clientId, keyId: a.keyId, privateKey: a.privateKey }),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    if (typeof tokens.id_token !== "string") throw new ProviderError("Apple didn't return an ID token.");
    const c = await verifyIdToken(tokens.id_token, {
      jwksUrl: "https://appleid.apple.com/auth/keys",
      issuers: ["https://appleid.apple.com"],
      audience: a.clientId,
      nonce,
    });
    return appleProfile(c, appleUser);
  },
};

// ---------------------------------------------------------------- Facebook (OAuth 2 + Graph API)

const facebook: OAuthAdapter = {
  id: "facebook",
  label: "Facebook",
  authorizeUrl: ({ state, codeChallenge, redirectUri }) =>
    `https://www.facebook.com/${config.oauth.facebook.graphVersion}/dialog/oauth?${new URLSearchParams({
      client_id: config.oauth.facebook.appId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "email,public_profile",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    })}`,
  async exchange({ code, codeVerifier, redirectUri }) {
    const f = config.oauth.facebook;
    const graph = `https://graph.facebook.com/${f.graphVersion}`;
    const tokenRes = await fetch(
      `${graph}/oauth/access_token?${new URLSearchParams({ client_id: f.appId, client_secret: f.appSecret, redirect_uri: redirectUri, code, code_verifier: codeVerifier })}`,
      { signal: AbortSignal.timeout(8000) },
    );
    const tokens = (await tokenRes.json().catch(() => ({}))) as { access_token?: string };
    if (!tokenRes.ok || !tokens.access_token) throw new ProviderError(`Facebook token exchange failed (${tokenRes.status}).`);
    // appsecret_proof stops a leaked access token being used without our app secret.
    const proof = createHmac("sha256", f.appSecret).update(tokens.access_token).digest("hex");
    const meRes = await fetch(`${graph}/me?${new URLSearchParams({ fields: "id,name,email", access_token: tokens.access_token, appsecret_proof: proof })}`, {
      signal: AbortSignal.timeout(8000),
    });
    const me = (await meRes.json().catch(() => ({}))) as { id?: string; name?: string; email?: string };
    if (!meRes.ok || !me.id) throw new ProviderError("Couldn't read the Facebook profile.");
    return {
      provider: "facebook",
      providerUserId: me.id,
      email: me.email ?? null, // absent when the person signed up with a phone number or declined
      // Facebook doesn't assert verification per sign-in, so we never treat it as verified for linking.
      emailVerified: false,
      isPrivateEmail: false,
      name: me.name ?? null,
    };
  },
};

// ---------------------------------------------------------------- local simulator (OAUTH_MOCK=1, localhost only)

/** The simulator encodes the chosen identity in the "code"; the nonce must still round-trip like a real ID token. */
export type MockIdentity = { sub: string; email: string | null; emailVerified: boolean; privateEmail: boolean; name: string | null; nonce: string };

function mockAdapter(id: OAuthProviderId): OAuthAdapter {
  return {
    id,
    label: PROVIDER_LABEL[id],
    authorizeUrl: ({ state, nonce, redirectUri }) => `${config.appUrl}/mock/oauth/${id}?${new URLSearchParams({ state, nonce, redirect_uri: redirectUri })}`,
    async exchange({ code, nonce, appleUser }) {
      let m: MockIdentity;
      try {
        m = JSON.parse(Buffer.from(code, "base64url").toString("utf8"));
      } catch {
        throw new ProviderError("Bad mock code.");
      }
      if (m.nonce !== nonce) throw new TokenError("Token nonce mismatch.");
      if (id === "apple") {
        return appleProfile({ sub: m.sub, email: m.email ?? undefined, email_verified: String(m.emailVerified), is_private_email: String(m.privateEmail) }, appleUser);
      }
      return {
        provider: id,
        providerUserId: m.sub,
        email: m.email,
        emailVerified: id === "facebook" ? false : m.emailVerified,
        isPrivateEmail: false,
        name: m.name,
      };
    },
  };
}

const REAL: Record<OAuthProviderId, OAuthAdapter> = { google, apple, facebook };

/** The adapter for a provider, or null if it isn't configured. */
export function oauthAdapter(id: string): OAuthAdapter | null {
  const { mode, enabled } = oauthProviders();
  if (!(enabled as string[]).includes(id)) return null;
  return mode === "mock" ? mockAdapter(id as OAuthProviderId) : REAL[id as OAuthProviderId];
}

export const redirectUriFor = (id: OAuthProviderId) => `${config.appUrl}/api/auth/oauth/${id}/callback`;
