import { createPrivateKey, createPublicKey, sign, verify, type JsonWebKey, type KeyObject } from "node:crypto";

/**
 * Just enough JOSE for OpenID Connect, on node:crypto: verify RS256 ID tokens against a
 * provider's JWKS, and sign Apple's ES256 client secret. No JWT dependency needed.
 */

export class TokenError extends Error {}

const b64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");
const decodeJson = (part: string) => {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    throw new TokenError("Malformed token.");
  }
};

// ---------------------------------------------------------------- JWKS cache

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
const jwksCache = new Map<string, { keys: Map<string, KeyObject>; fetchedAt: number }>();
const JWKS_TTL = 60 * 60_000;

export type JwksFetcher = (url: string) => Promise<{ keys: Jwk[] }>;
const defaultFetcher: JwksFetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new TokenError(`Couldn't load signing keys (${res.status}).`);
  return res.json();
};

async function keyFor(jwksUrl: string, kid: string, fetcher: JwksFetcher): Promise<KeyObject> {
  const cached = jwksCache.get(jwksUrl);
  const fresh = cached && Date.now() - cached.fetchedAt < JWKS_TTL;
  if (fresh && cached.keys.has(kid)) return cached.keys.get(kid)!;
  // Unknown kid: providers rotate keys, so refetch (at most once a minute) before giving up.
  if (!cached || !fresh || Date.now() - cached.fetchedAt > 60_000) {
    const { keys } = await fetcher(jwksUrl);
    const map = new Map<string, KeyObject>();
    for (const k of keys ?? []) if (k.kid && k.kty === "RSA") map.set(k.kid, createPublicKey({ key: k, format: "jwk" }));
    jwksCache.set(jwksUrl, { keys: map, fetchedAt: Date.now() });
    if (map.has(kid)) return map.get(kid)!;
  }
  throw new TokenError("Token signed with an unknown key.");
}

export const _clearJwksCache = () => jwksCache.clear();

// ---------------------------------------------------------------- ID token verification

export type IdTokenClaims = Record<string, unknown> & { sub: string; iss: string; aud: string | string[]; exp: number; iat?: number; nonce?: string };

export async function verifyIdToken(
  token: string,
  opts: { jwksUrl: string; issuers: string[]; audience: string; nonce: string; fetcher?: JwksFetcher; now?: number },
): Promise<IdTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new TokenError("Malformed token.");
  const header = decodeJson(parts[0]);
  // Only RS256: never trust the token to pick its own algorithm ("none", HS256 with a public key, ...).
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new TokenError("Unexpected token algorithm.");
  const key = await keyFor(opts.jwksUrl, header.kid, opts.fetcher ?? defaultFetcher);
  const ok = verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"));
  if (!ok) throw new TokenError("Bad token signature.");

  const c = decodeJson(parts[1]) as IdTokenClaims;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const skew = 120;
  if (!opts.issuers.includes(c.iss)) throw new TokenError("Wrong token issuer.");
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(opts.audience)) throw new TokenError("Token is for another app.");
  if (typeof c.exp !== "number" || c.exp + skew < now) throw new TokenError("Token expired.");
  if (typeof c.iat === "number" && c.iat - skew > now) throw new TokenError("Token issued in the future.");
  if (!c.nonce || c.nonce !== opts.nonce) throw new TokenError("Token nonce mismatch.");
  if (typeof c.sub !== "string" || !c.sub) throw new TokenError("Token has no subject.");
  return c;
}

// ---------------------------------------------------------------- Apple client secret

/**
 * Apple's "client secret" is a short-lived ES256 JWT signed with the .p8 key from the
 * developer portal: iss = Team ID, sub = Services ID, aud = https://appleid.apple.com.
 */
export function appleClientSecret(opts: { teamId: string; clientId: string; keyId: string; privateKey: string; now?: number }) {
  const iat = Math.floor((opts.now ?? Date.now()) / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: opts.keyId, typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iss: opts.teamId, iat, exp: iat + 300, aud: "https://appleid.apple.com", sub: opts.clientId }));
  const signature = sign("sha256", Buffer.from(`${header}.${payload}`), {
    key: createPrivateKey(opts.privateKey),
    dsaEncoding: "ieee-p1363", // JOSE wants raw r||s, not DER
  });
  return `${header}.${payload}.${b64url(signature)}`;
}
