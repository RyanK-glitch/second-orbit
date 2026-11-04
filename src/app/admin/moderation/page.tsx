import type { Metadata } from "next";
import Link from "next/link";
import { fmtDate } from "@/components/bits";
import { ModerationActions } from "@/components/ModerationActions";
import { requirePageModerator } from "@/lib/auth/page";
import { DISPUTE_REASONS, REPORT_REASONS, SHIPMENT_STATUS_LABEL } from "@/lib/catalog";
import { formatCents } from "@/lib/money";
import { openDisputes, openReports, recentModerationActions } from "@/lib/moderation";

export const metadata: Metadata = { title: "Moderation queue", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  await requirePageModerator("/admin/moderation");
  const [disputes, reports, actions] = await Promise.all([openDisputes(), openReports(), recentModerationActions()]);
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Trust &amp; Safety</span>
        <h1>Moderation queue</h1>
        <p>{disputes.length} open dispute{disputes.length === 1 ? "" : "s"} · {reports.length} open report{reports.length === 1 ? "" : "s"}</p>
      </div>

      <section aria-labelledby="disputes-title">
        <h2 id="disputes-title">Disputes (escrow on hold)</h2>
        {disputes.length === 0 && <p className="hint">No open disputes.</p>}
        {disputes.map((d) => (
          <article key={d.id} className="mod-card glass" aria-label={`Dispute on ${d.titles}`}>
            <header>
              <strong>{d.titles}</strong>
              <span className="hint">Opened {fmtDate(d.created_at)}</span>
            </header>
            <dl className="kv">
              <dt>Buyer → seller</dt><dd>{d.buyer_name} → {d.seller_name}</dd>
              <dt>Order total</dt><dd>{formatCents(d.total_cents, true)} · <Link href={`/account/orders/${d.order_id}`}>View order</Link></dd>
              <dt>Reason</dt><dd>{DISPUTE_REASONS.find((r) => r.value === d.reason)?.label ?? d.reason}</dd>
              <dt>Delivery</dt><dd>{d.delivery_method === "pickup" ? "Pickup" : d.tracking_code ? `${SHIPMENT_STATUS_LABEL[d.shipment_status] ?? d.shipment_status} (${d.tracking_code})` : "Not shipped"}</dd>
            </dl>
            <p className="quote">{d.details}</p>
            {d.seller_response ? <p className="quote"><strong>Seller:</strong> {d.seller_response}</p> : <p className="hint">The seller hasn&apos;t responded yet.</p>}
            <ModerationActions
              endpoint={`/api/admin/disputes/${d.id}`}
              field="outcome"
              refundMax={d.total_cents}
              options={[{ value: "refund", label: "Refund buyer" }, { value: "release", label: "Release to seller" }]}
            />
          </article>
        ))}
      </section>

      <section className="section" aria-labelledby="reports-title">
        <h2 id="reports-title">Reports</h2>
        {reports.length === 0 && <p className="hint">No open reports.</p>}
        {reports.map((r) => (
          <article key={r.id} className="mod-card glass" aria-label={`Report about ${r.target_type}`}>
            <header>
              <strong>{r.target_type === "listing" ? "Listing" : r.target_type === "user" ? "User" : "Message"}: {r.target_summary ?? "(deleted)"}</strong>
              <span className="hint">Reported by {r.reporter_name} · {fmtDate(r.created_at)}</span>
            </header>
            <dl className="kv">
              <dt>Reason</dt><dd>{REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}</dd>
              {r.target_type === "listing" && <><dt>Listing</dt><dd><Link href={`/listings/${r.target_id}`}>Open listing</Link></dd></>}
              {r.subject_user_id && <><dt>Account</dt><dd><Link href={`/sellers/${r.subject_user_id}`}>View profile</Link></dd></>}
            </dl>
            {r.details && <p className="quote">{r.details}</p>}
            <ModerationActions
              endpoint={`/api/admin/reports/${r.id}`}
              field="action"
              options={[
                ...(r.target_type === "listing" ? [{ value: "remove_listing", label: "Remove listing" }] : []),
                { value: "suspend_user", label: "Suspend account" },
                { value: "dismiss", label: "Dismiss" },
              ]}
            />
          </article>
        ))}
      </section>

      <section className="section" aria-labelledby="audit-title">
        <h2 id="audit-title">Recent actions</h2>
        {actions.length ? (
          <div className="table-wrap glass">
            <table className="table">
              <thead><tr><th scope="col">When</th><th scope="col">Moderator</th><th scope="col">Action</th><th scope="col">Note</th></tr></thead>
              <tbody>
                {actions.map((a) => (
                  <tr key={a.id}><td>{fmtDate(a.created_at)}</td><td>{a.moderator_name}</td><td>{a.action.replace(/_/g, " ")}</td><td>{a.note}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="hint">No actions yet.</p>}
      </section>
    </>
  );
}
