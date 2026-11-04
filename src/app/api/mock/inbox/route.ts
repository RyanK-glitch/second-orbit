import { sql } from "@/lib/db";
import { isLocalApp, isMock } from "@/lib/env";
import { notFound, route } from "@/lib/http";

/** The test inbox as JSON, for the e2e suite. Holds live reset links, so it only exists on localhost. */
export const GET = route(async (req) => {
  if (!isMock("email") || !isLocalApp()) throw notFound();
  const to = new URL(req.url).searchParams.get("to") ?? "";
  const emails = await sql`
    SELECT to_email, reply_to, template, subject, body, status, created_at FROM email_outbox
    WHERE lower(to_email) = lower(${to}) ORDER BY created_at DESC LIMIT 50`;
  return { emails };
});
