import { describe, expect, it } from "vitest";
import { seal, unseal } from "@/lib/auth/secret-box";
import { base32Decode, base32Encode, codeForStep, hashRecoveryCode, matchTotp, newRecoveryCode, normalizeRecoveryCode, otpauthUri, PERIOD_SECONDS, timeStep } from "@/lib/auth/totp";

// RFC 6238 appendix B publishes 8-digit SHA-1 vectors for this key; the last 6 digits are the 6-digit code.
const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_VECTORS: [number, string][] = [[59, "287082"], [1111111109, "081804"], [1234567890, "005924"], [2000000000, "279037"]];

describe("TOTP", () => {
  it("matches the RFC 6238 test vectors", () => {
    for (const [seconds, code] of RFC_VECTORS) expect(codeForStep(RFC_SECRET, Math.floor(seconds / PERIOD_SECONDS))).toBe(code);
  });

  it("round-trips base32, including the RFC 4648 example", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("mzxw 6ytb oi==").toString()).toBe("foobar");
    expect(() => base32Decode("not!base32")).toThrow();
  });

  const at = 1_800_000_000_000;
  const now = timeStep(at);

  it("accepts the current step and one step of clock drift either way, but no more", () => {
    for (const offset of [-1, 0, 1]) expect(matchTotp(RFC_SECRET, codeForStep(RFC_SECRET, now + offset), 0, at)).toBe(now + offset);
    for (const offset of [-2, 2]) expect(matchTotp(RFC_SECRET, codeForStep(RFC_SECRET, now + offset), 0, at)).toBeNull();
  });

  it("refuses a code from a step that was already used", () => {
    const code = codeForStep(RFC_SECRET, now);
    expect(matchTotp(RFC_SECRET, code, now - 1, at)).toBe(now);
    expect(matchTotp(RFC_SECRET, code, now, at)).toBeNull();
    expect(matchTotp(RFC_SECRET, codeForStep(RFC_SECRET, now - 1), now, at)).toBeNull();
  });

  it("refuses anything that isn't six digits", () => {
    for (const bad of ["", "12345", "1234567", "abcdef", "12 456"]) expect(matchTotp(RFC_SECRET, bad, 0, at)).toBeNull();
  });

  it("builds a URI authenticator apps can read", () => {
    const uri = otpauthUri("Second Orbit", "a b@example.com", "ABC");
    expect(uri).toContain("otpauth://totp/Second%20Orbit%3Aa%20b%40example.com?");
    expect(uri).toContain("issuer=Second%20Orbit");
    expect(uri).not.toContain("+");
  });
});

describe("recovery codes", () => {
  it("look like XXXXX-XXXXX and don't repeat", () => {
    const codes = Array.from({ length: 200 }, newRecoveryCode);
    for (const c of codes) expect(c).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    expect(new Set(codes).size).toBe(200);
  });

  it("match however they're typed", () => {
    expect(normalizeRecoveryCode("abcde-fg234")).toBe("ABCDEFG234");
    expect(hashRecoveryCode(" abcde fg234 ")).toBe(hashRecoveryCode("ABCDE-FG234"));
  });
});

describe("secret box", () => {
  const secret = Buffer.from("top secret");

  it("round-trips, and produces different output each time", () => {
    expect(unseal(seal(secret, "user-1"), "user-1")).toEqual(secret);
    expect(seal(secret, "user-1")).not.toBe(seal(secret, "user-1"));
  });

  it("can't be copied onto another account or tampered with", () => {
    const sealed = seal(secret, "user-1");
    expect(() => unseal(sealed, "user-2")).toThrow();
    const parts = sealed.split(".");
    parts[3] = Buffer.from("tampered!!").toString("base64url");
    expect(() => unseal(parts.join("."), "user-1")).toThrow();
  });
});
