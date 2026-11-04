import type { Metadata } from "next";
import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { fmtDate } from "@/components/bits";
import { requirePagePermission } from "@/lib/auth/page";
import { listChargebacks } from "@/lib/chargebacks";
import { isMock } from "@/lib/env";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Chargebacks", robots: { index: false } };
export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = { open: "Open: payouts frozen", won: "Won", lost: "Lost" };

export default async function ChargebacksPage() {
  await requirePagePermission("moderation.act", "/admin/chargebacks");
  const rows = await listChargebacks();
  const mock = isMock("payments");
  const open = rows.filter((r) => r.status === "open").length;
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Payments</span>
        <h1>Chargebacks</h1>
        <p>{open} open. The bank has already taken the money back, and payouts stay frozen until it decides.</p>
      </div>
      {rows.length === 0 && <p className="hint">No chargebacks yet.</p>}
      {rows.map((c) => (
        <section className="panel glass" key={c.id} aria-label={`Chargeback for ${c.titles ?? "unknown charge"}`}>
          <h2>{c.titles ?? "Charge not matched to an order"}</h2>
          <dl className="kv">
            <dt>Status</dt><dd><strong>{LABEL[c.status]}</strong></dd>
            <dt>Amount</dt><dd>{formatCents(c.amount_cents, true)}</dd>
            <dt>Bank&apos;s reason</dt><dd>{c.reason || "Not stated"}</dd>
            {c.buyer_name && (<><dt>Buyer</dt><dd>{c.buyer_name}</dd></>)}
            {c.evidence_due_by && c.status === "open" && (<><dt>Evidence due</dt><dd>{fmtDate(c.evidence_due_by)}</dd></>)}
            <dt>Evidence</dt><dd>{c.evidence_submitted_at ? `Submitted ${fmtDate(c.evidence_submitted_at)}` : "Not submitted"}</dd>
            {c.order_id && (<><dt>Order</dt><dd><Link href={`/account/orders/${c.order_id}`}>View order</Link></dd></>)}
          </dl>
          {c.recovery_failed && (
            <div className="alert alert-warn" style={{ marginTop: 12 }}><p>The seller&apos;s payout couldn&apos;t be reversed, so the platform carries this loss.</p></div>
          )}
          {c.status === "open" && (
            <div className="actions-row">
              {!c.evidence_submitted_at && c.checkout_id && (
                <ActionButton endpoint={`/api/admin/chargebacks/${c.id}/evidence`} className="btn btn-primary" confirmText="Send this order's records to the bank? This can only be done once.">Submit evidence</ActionButton>
              )}
              {mock && c.order_id && (
                <>
                  <ActionButton endpoint="/api/mock/stripe/chargeback" body={{ orderId: c.order_id, status: "won" }} className="btn">Simulate bank decision: won (test)</ActionButton>
                  <ActionButton endpoint="/api/mock/stripe/chargeback" body={{ orderId: c.order_id, status: "lost" }} className="btn">Simulate bank decision: lost (test)</ActionButton>
                </>
              )}
            </div>
          )}
        </section>
      ))}
    </>
  );
}
