import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AccountNav } from "@/components/AccountNav";
import { Breadcrumbs } from "@/components/bits";
import { MessageThread } from "@/components/MessageThread";
import { ReportButton } from "@/components/ReportButton";
import { requirePageUser } from "@/lib/auth/page";
import { HttpError, isUuid } from "@/lib/http";
import { getConversation } from "@/lib/messaging";

export const metadata: Metadata = { title: "Conversation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function Thread({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requirePageUser(`/messages/${id}`);
  let c: Awaited<ReturnType<typeof getConversation>>;
  try {
    c = await getConversation(id, user);
  } catch (e) {
    if (e instanceof HttpError) notFound();
    throw e;
  }
  return (
    <div className="account-layout">
      <AccountNav />
      <div>
        <Breadcrumbs items={[{ label: "Messages", href: "/messages" }, { label: c.otherName }]} />
        <div className="page-head">
          <h1>{c.otherName}</h1>
          <div className="hint">About <Link href={`/listings/${c.listingId}`}>{c.listingTitle}</Link> · <ReportButton targetType="user" targetId={c.otherId} label={`Report ${c.otherName}`} /></div>
        </div>
        <MessageThread
          conversationId={c.id}
          meId={user.id}
          otherName={c.otherName}
          initial={c.messages.map((m) => ({ id: m.id, sender_id: m.sender_id, body: m.body, created_at: new Date(m.created_at).toISOString() }))}
        />
      </div>
    </div>
  );
}
