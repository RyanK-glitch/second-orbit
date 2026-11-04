import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** TOTP (RFC 6238) with the settings every authenticator app supports: SHA-1, 6 digits, 30 seconds. */
export const PERIOD_SECONDS = 30;
const DIGITS = 6;
// One step either side allows for clock drift between the phone and the server.
const WINDOW = 1;
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.toUpperCase().replace(/[\s=]/g, "")) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error("Invalid base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
    value &= (1 << bits) - 1;
  }
  return Buffer.from(out);
}

export const timeStep = (at = Date.now()) => Math.floor(at / 1000 / PERIOD_SECONDS);

/** The code for one time step (HOTP, RFC 4226). */
export function codeForStep(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS).padStart(DIGITS, "0");
}

/**
 * Returns the matching time step, or null. A step at or before `lastStep` has been used already,
 * so a code that was seen once (shoulder-surfed, phished) can't be replayed within its window.
 */
export function matchTotp(secret: Buffer, code: string, lastStep: number, at = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const given = Buffer.from(code);
  const now = timeStep(at);
  let matched: number | null = null;
  // Checks every candidate so the timing doesn't reveal which step matched.
  for (let step = now - WINDOW; step <= now + WINDOW; step++) {
    if (timingSafeEqual(Buffer.from(codeForStep(secret, step)), given) && step > lastStep) matched = step;
  }
  return matched;
}

export function otpauthUri(issuer: string, account: string, secret: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: "SHA1", digits: String(DIGITS), period: String(PERIOD_SECONDS) });
  return `otpauth://totp/${label}?${params.toString().replace(/\+/g, "%20")}`;
}

// ---------------------------------------------------------------- recovery codes

/** 50 random bits, shown once as XXXXX-XXXXX. That much entropy makes a plain SHA-256 safe to store. */
export function newRecoveryCode() {
  const raw = base32Encode(randomBytes(7)).slice(0, 10);
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

export const normalizeRecoveryCode = (code: string) => code.toUpperCase().replace(/[^A-Z2-7]/g, "");
export const hashRecoveryCode = (code: string) => createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
