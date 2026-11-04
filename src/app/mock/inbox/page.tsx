import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fmtDate } from "@/components/bits";
import { sql } from "@/lib/db";
import { isLocalApp, isMock } from "@/lib/env";

export const metadata: Metadata = { title: "Test inbox", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Turns URLs in a plain-text email into links; everything else stays escaped text. */
function Body({ text }: { text: string }) {
  return <p className="quote">{text.split(/(https?:\/\/\S+)/).map((part, i) => (i % 2 ? <a key={i} href={part}>{part}</a> : part))}</p>;
}

/** Every email the app "sent" while the email adapter is mocked. Holds live reset links, so localhost only. */
export default async function MockInbox() {
  if (!isMock("email") || !isLocalApp()) notFound();
  const emails = await sql`SELECT id, to_email, subject, body, created_at FROM email_outbox ORDER BY created_at DESC LIMIT 50`;
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="page-head">
        <span className="eyebrow">Mock email · test mode</span>
        <h1>Test inbox</h1>
        <p>The newest 50 emails. With a Resend key set, these go out for real and this page disappears.</p>
      </div>
      {emails.length === 0 && <p className="hint">Nothing has been sent yet.</p>}
      {emails.map((e) => (
        <article className="panel glass" key={e.id}>
          <h2>{e.subject}</h2>
          <p className="hint">To {e.to_email} · {fmtDate(e.created_at)}</p>
          <Body text={e.body} />
        </article>
      ))}
    </div>
  );
}
