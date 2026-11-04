import { generateKeyPairSync, sign, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { _clearJwksCache, appleClientSecret, verifyIdToken, type JwksFetcher } from "@/lib/auth/oauth/jwt";
import { decideNewSignIn, displayNameFor } from "@/lib/auth/oauth/policy";
import { appleNameFromUser, appleProfile, type OAuthProfile } from "@/lib/auth/oauth/providers";
import { oauthProviders } from "@/lib/env";

// ---------------------------------------------------------------- helpers

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function token(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "k1" }, key = privateKey) {
  const head = `${b64(header)}.${b64(claims)}`;
  return `${head}.${sign("RSA-SHA256", Buffer.from(head), key).toString("base64url")}`;
}

const NOW = Date.UTC(2026, 9, 27, 12);
const base = { iss: "https://accounts.google.com", aud: "client-123", sub: "user-1", nonce: "n-1", iat: NOW / 1000, exp: NOW / 1000 + 3600 };
let fetches = 0;
const fetcher: JwksFetcher = async () => {
  fetches++;
  return { keys: [jwk] };
};
const opts = { jwksUrl: "https://example.test/jwks", issuers: ["https://accounts.google.com"], audience: "client-123", nonce: "n-1", fetcher, now: NOW };

beforeEach(() => {
  _clearJwksCache();
  fetches = 0;
});

// ---------------------------------------------------------------- ID tokens

describe("ID token verification", () => {
  it("accepts a valid token and caches the signing keys", async () => {
    expect((await verifyIdToken(token(base), opts)).sub).toBe("user-1");
    await verifyIdToken(token(base), opts);
    expect(fetches).toBe(1);
  });

  it.each([
    ["wrong audience", { ...base, aud: "someone-else" }, /another app/],
    ["wrong issuer", { ...base, iss: "https://evil.example" }, /issuer/],
    ["expired", { ...base, exp: NOW / 1000 - 600 }, /expired/],
    ["issued in the future", { ...base, iat: NOW / 1000 + 600 }, /future/],
    ["nonce mismatch (replayed token)", { ...base, nonce: "other" }, /nonce/],
    ["missing nonce", { ...base, nonce: undefined }, /nonce/],
  ])("rejects a token with %s", async (_label, claims, error) => {
    await expect(verifyIdToken(token(claims), opts)).rejects.toThrow(error);
  });

  it("rejects a forged signature", async () => {
    const other = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    await expect(verifyIdToken(token(base, undefined, other), opts)).rejects.toThrow(/signature/);
  });

  it("rejects tampered claims", async () => {
    const [h, , s] = token(base).split(".");
    await expect(verifyIdToken(`${h}.${b64({ ...base, sub: "admin" })}.${s}`, opts)).rejects.toThrow(/signature/);
  });

  it("never lets the token choose its algorithm", async () => {
    await expect(verifyIdToken(token(base, { alg: "none", kid: "k1" }), opts)).rejects.toThrow(/algorithm/);
    await expect(verifyIdToken(token(base, { alg: "HS256", kid: "k1" }), opts)).rejects.toThrow(/algorithm/);
  });

  it("refetches keys once for an unknown kid, then gives up", async () => {
    await expect(verifyIdToken(token(base, { alg: "RS256", kid: "rotated" }), opts)).rejects.toThrow(/unknown key/);
    expect(fetches).toBe(1);
  });
});

// ---------------------------------------------------------------- Apple

describe("Sign in with Apple", () => {
  it("signs an ES256 client secret Apple can verify", () => {
    const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = ec.privateKey.export({ format: "pem", type: "pkcs8" }).toString();
    const jwt = appleClientSecret({ teamId: "TEAM123456", clientId: "com.example.web", keyId: "KEY1", privateKey: pem, now: NOW });
    const [h, p, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY1", typ: "JWT" });
    expect(JSON.parse(Buffer.from(p, "base64url").toString())).toMatchObject({ iss: "TEAM123456", sub: "com.example.web", aud: "https://appleid.apple.com" });
    const ok = verify("sha256", Buffer.from(`${h}.${p}`), { key: ec.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });

  it("reads the name only from the first-consent user payload", () => {
    expect(appleNameFromUser('{"name":{"firstName":"Zoë","lastName":"Ng"},"email":"z@example.com"}')).toBe("Zoë Ng");
    expect(appleNameFromUser({ name: { firstName: "Ana" } })).toBe("Ana");
    expect(appleNameFromUser(null)).toBeNull();
    expect(appleNameFromUser("not json")).toBeNull();
  });

  it("handles string booleans and private relay addresses", () => {
    const relay = appleProfile({ sub: "a.1", email: "x7q@privaterelay.appleid.com", email_verified: "true", is_private_email: "true" }, null);
    expect(relay).toMatchObject({ emailVerified: true, isPrivateEmail: true, name: null });
    // A relay address is recognised even if the flag is missing.
    expect(appleProfile({ sub: "a.1", email: "x7q@privaterelay.appleid.com", email_verified: true }, null).isPrivateEmail).toBe(true);
    // Later sign-ins may omit the email entirely.
    expect(appleProfile({ sub: "a.1" }, null)).toMatchObject({ email: null, emailVerified: false });
  });
});

// ---------------------------------------------------------------- linking policy

const profile = (p: Partial<OAuthProfile>): OAuthProfile => ({
  provider: "google", providerUserId: "s", email: "pat@example.com", emailVerified: true, isPrivateEmail: false, name: "Pat", ...p,
});
const member = { id: "u1", role: "user" as const, suspended: false };

describe("account linking policy", () => {
  it("links Google/Apple to an existing member only with a verified email", () => {
    expect(decideNewSignIn(profile({}), member)).toEqual({ kind: "link", userId: "u1" });
    expect(decideNewSignIn(profile({ provider: "apple" }), member)).toEqual({ kind: "link", userId: "u1" });
    expect(decideNewSignIn(profile({ emailVerified: false }), member)).toEqual({ kind: "refuse", reason: "email_exists" });
  });

  it("never auto-links Facebook, relay addresses, staff or suspended accounts", () => {
    expect(decideNewSignIn(profile({ provider: "facebook" }), member)).toEqual({ kind: "refuse", reason: "email_exists" });
    expect(decideNewSignIn(profile({ provider: "apple", isPrivateEmail: true }), member)).toEqual({ kind: "refuse", reason: "email_exists" });
    expect(decideNewSignIn(profile({}), { ...member, role: "admin" })).toEqual({ kind: "refuse", reason: "staff_link" });
    expect(decideNewSignIn(profile({}), { ...member, role: "moderator" })).toEqual({ kind: "refuse", reason: "staff_link" });
    expect(decideNewSignIn(profile({}), { ...member, suspended: true })).toEqual({ kind: "refuse", reason: "suspended" });
  });

  it("creates new accounts only for usable emails", () => {
    expect(decideNewSignIn(profile({}), null)).toEqual({ kind: "create" });
    expect(decideNewSignIn(profile({ provider: "facebook", emailVerified: false }), null)).toEqual({ kind: "create" });
    expect(decideNewSignIn(profile({ provider: "apple", isPrivateEmail: true }), null)).toEqual({ kind: "create" });
    expect(decideNewSignIn(profile({ emailVerified: false }), null)).toEqual({ kind: "refuse", reason: "unverified_email" });
    expect(decideNewSignIn(profile({ email: null }), null)).toEqual({ kind: "refuse", reason: "no_email" });
  });

  it("picks a sensible display name", () => {
    expect(displayNameFor(profile({ name: "Pat Lee" }))).toBe("Pat Lee");
    expect(displayNameFor(profile({ name: null, email: "pat.lee@example.com" }))).toBe("pat lee");
    // Never expose a relay address's random local part as a name.
    expect(displayNameFor(profile({ provider: "apple", name: null, email: "x7q@privaterelay.appleid.com", isPrivateEmail: true }))).toBe("Apple member");
  });
});

// ---------------------------------------------------------------- provider selection

describe("social provider selection", () => {
  const KEYS = ["OAUTH_MOCK", "APP_URL", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "APPLE_CLIENT_ID", "APPLE_TEAM_ID", "APPLE_KEY_ID", "APPLE_PRIVATE_KEY", "FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"];
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  const set = (env: Record<string, string>) => {
    for (const k of KEYS) delete process.env[k];
    Object.assign(process.env, env);
  };
  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("offers nothing without keys and each provider once its keys are complete", () => {
    set({});
    expect(oauthProviders()).toEqual({ mode: "real", enabled: [] });
    set({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret", FACEBOOK_APP_ID: "fb", APPLE_CLIENT_ID: "com.x", APPLE_TEAM_ID: "T" });
    expect(oauthProviders().enabled).toEqual(["google"]); // Facebook and Apple are missing a secret/key
  });

  it("only allows the simulator on localhost", () => {
    set({ OAUTH_MOCK: "1", APP_URL: "http://127.0.0.1:3100" });
    expect(oauthProviders()).toEqual({ mode: "mock", enabled: ["google", "apple", "facebook"] });
    set({ OAUTH_MOCK: "1", APP_URL: "https://shop.example.com" });
    expect(() => oauthProviders()).toThrow(/only allowed when APP_URL is localhost/);
  });
});
