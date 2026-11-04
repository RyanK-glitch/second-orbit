import { createHash, randomBytes } from "node:crypto";
import { sql, type Tx } from "../db";

/** Single-use emailed tokens. Only the hash is stored, so a database reader can't use one. */
export type TokenPurpose = "password_reset" | "email_verify";

const TTL_MINUTES: Record<TokenPurpose, number> = { password_reset: 60, email_verify: 24 * 60 };
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Issuing a new token cancels any earlier one for the same purpose. */
export async function issueToken(db: Tx | typeof sql, userId: string, purpose: TokenPurpose) {
  const token = randomBytes(32).toString("base64url");
  await db`DELETE FROM account_tokens WHERE user_id = ${userId} AND purpose = ${purpose}`;
  await db`
    INSERT INTO account_tokens (token_hash, user_id, purpose, expires_at)
    VALUES (${hash(token)}, ${userId}, ${purpose}, now() + make_interval(mins => ${TTL_MINUTES[purpose]}))`;
  return token;
}

/** Atomically spends a token: two simultaneous requests can't both get the user id. */
export async function consumeToken(db: Tx | typeof sql, token: string, purpose: TokenPurpose): Promise<string | null> {
  const [row] = await db`
    DELETE FROM account_tokens WHERE token_hash = ${hash(token)} AND purpose = ${purpose} AND expires_at > now()
    RETURNING user_id`;
  return (row?.user_id as string) ?? null;
}
