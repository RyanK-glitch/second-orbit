import { randomUUID } from "node:crypto";
import { config } from "../env";
import type { EmailAdapter } from "./types";

/** Keeps the message in the outbox table, where /mock/inbox shows it. Nothing leaves the machine. */
export const mockEmail: EmailAdapter = {
  name: "mock",
  async send() {
    return { id: `mock_${randomUUID()}` };
  },
};

/** Resend's HTTP API. Plain fetch: one endpoint doesn't justify another SDK. */
export const resendEmail: EmailAdapter = {
  name: "resend",
  async send({ to, subject, text, replyTo, idempotencyKey }) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.email.resendApiKey}`,
        "Content-Type": "application/json",
        // The outbox retries, so a retry after a lost response mustn't send twice.
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({ from: config.email.from, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return { id: ((await res.json()) as { id: string }).id };
  },
};
