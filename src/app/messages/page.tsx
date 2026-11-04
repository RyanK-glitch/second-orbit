import type { Metadata } from "next";
import Link from "next/link";
import { AccountNav } from "@/components/AccountNav";
import { timeAgo } from "@/components/bits";
import { requirePageUser } from "@/lib/auth/page";
import { listConversations } from "@/lib/messaging";

export const metadata: Metadata = { title: "Messages", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Messages() {
  const user = await requirePageUser("/messages");
  const convs = await listConversations(user);
  return (
    <div className="account-layout">
      <AccountNav />
      <div>
        <div className="page-head"><h1>Messages</h1><p>Questions about listings and orders.</p></div>
        {convs.length ? (
          <ul className="conv-list">
            {convs.map((c) => (
              <li key={c.id}>
                <Link className="glass" href={`/messages/${c.id}`}>
                  <strong>{c.other_name} · {c.listing_title}</strong>
                  <span className="hint">{timeAgo(c.last_message_at)}{c.unread ? ` · ${c.unread} new` : ""}</span>
                  <span className="muted">{c.last_body}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty glass"><p>No conversations yet. Use “Message seller” on any listing to ask a question.</p></div>
        )}
      </div>
    </div>
  );
}
