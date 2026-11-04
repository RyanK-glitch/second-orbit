import { after } from "next/server";
import { sql, type Tx } from "./db";
import { templates, type TemplateName, type TemplateVars } from "./email-templates";
import { email as emailAdapter } from "./integrations";

/**
 * Transactional outbox. Callers write the email inside their own transaction, so it exists only if
 * the change it describes committed. Sending happens afterwards, retries with backoff, and can
 * never fail or slow down the request that caused it.
 */
const MAX_ATTEMPTS = 6;

type Db = Tx | typeof sql;
type Options = { dedupeKey?: string; replyTo?: string };

function render<T extends TemplateName>(template: T, vars: TemplateVars<T>) {
  return (templates[template] as (v: TemplateVars<T>) => { subject: string; body: string })(vars);
}

/** Runs once the response is sent, by which point the caller's transaction has committed. */
function flushAfterResponse() {
  try {
    after(() => flushOutbox().catch((err) => console.error("[email] flush failed", err)));
  } catch {
    // Outside a request (scripts). The cron job picks the email up instead.
  }
}

export async function enqueueEmail<T extends TemplateName>(db: Db, to: string, template: T, vars: TemplateVars<T>, opts: Options = {}) {
  const { subject, body } = render(template, vars);
  await db`
    INSERT INTO email_outbox (to_email, reply_to, template, subject, body, dedupe_key)
    VALUES (${to}, ${opts.replyTo ?? null}, ${template}, ${subject}, ${body}, ${opts.dedupeKey ?? null})
    ON CONFLICT (dedupe_key) DO NOTHING`;
  flushAfterResponse();
}

/** Emails a member by id. Deleted accounts are skipped, so nothing goes to an anonymised address. */
export async function notifyUser<T extends TemplateName>(db: Db, userId: string, template: T, vars: TemplateVars<T>, opts: Options = {}) {
  const [u] = await db`SELECT email FROM users WHERE id = ${userId} AND deleted_at IS NULL`;
  if (u) await enqueueEmail(db, u.email, template, vars, opts);
}

/** Claims due rows before sending, so overlapping runs can't pick up the same email. */
export async function flushOutbox(limit = 25) {
  const batch = await sql`
    UPDATE email_outbox SET attempts = attempts + 1,
      next_attempt_at = now() + make_interval(mins => least(5 * power(2, attempts)::int, 360))
    WHERE id IN (
      SELECT id FROM email_outbox WHERE status = 'pending' AND next_attempt_at <= now()
      ORDER BY created_at LIMIT ${limit} FOR UPDATE SKIP LOCKED)
    RETURNING id, to_email, reply_to, subject, body, attempts`;
  let sent = 0;
  for (const row of batch) {
    try {
      const adapter = emailAdapter();
      const { id } = await adapter.send({ to: row.to_email, subject: row.subject, text: row.body, replyTo: row.reply_to ?? undefined, idempotencyKey: row.id });
      // A real provider now has the email, so stop keeping reset links here. The mock keeps it for /mock/inbox.
      await sql`
        UPDATE email_outbox SET status = 'sent', sent_at = now(), provider_id = ${id}, last_error = NULL,
          body = ${adapter.name === "mock" ? row.body : ""}
        WHERE id = ${row.id}`;
      sent++;
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      console.error("[email] send failed", row.id, message);
      await sql`
        UPDATE email_outbox SET last_error = ${message}, status = ${row.attempts >= MAX_ATTEMPTS ? "failed" : "pending"}
        WHERE id = ${row.id}`;
    }
  }
  return { attempted: batch.length, sent };
}
