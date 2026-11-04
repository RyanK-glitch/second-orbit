import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { Breadcrumbs, fmtDate, OrderStatus, Stars } from "@/components/bits";
import { DisputeForm, DisputeResponseForm, PickupForm, ReviewForm } from "@/components/OrderForms";
import { ShieldIcon } from "@/components/icons";
import { requirePageUser } from "@/lib/auth/page";
import { DISPUTE_REASONS, ORDER_STATUS_LABEL, SHIPMENT_STATUS_LABEL } from "@/lib/catalog";
import { config } from "@/lib/env";
import { HttpError, isUuid } from "@/lib/http";
import type { TrackingEvent } from "@/lib/integrations/types";
import { formatCents } from "@/lib/money";
import { getOrderForUser } from "@/lib/orders";

export const metadata: Metadata = { title: "Order details" };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const user = await requirePageUser(`/account/orders/${id}`);
  let view: Awaited<ReturnType<typeof getOrderForUser>>;
  try {
    view = await getOrderForUser(id, user);
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const { order: o, role, items, shipment, pickups, dispute, review, can, releaseAt, shipTo, payoutFrozen } = view;
  const isPickup = o.delivery_method === "pickup";
  const payout = o.items_cents + o.shipping_cents - o.platform_fee_cents;

  const steps = [
    { label: "Paid: funds held in escrow", at: o.paid_at },
    { label: isPickup ? "Pickup arranged" : "Shipped", at: isPickup ? (pickups.find((p) => p.status === "accepted" || p.status === "completed")?.created_at ?? null) : o.shipped_at },
    { label: isPickup ? "Collected" : "Delivered", at: o.delivered_at },
    { label: o.status === "refunded" ? "Refunded to buyer" : "Completed: seller paid", at: o.completed_at ?? (o.status === "refunded" ? o.created_at : null) },
  ];
  const otherParty = role === "buyer" ? o.seller_name : o.buyer_name;
  const accepted = pickups.find((p) => p.status === "accepted");
  const proposed = pickups.find((p) => p.status === "proposed");

  return (
    <>
      <Breadcrumbs items={[{ label: role === "seller" ? "Sales" : "Purchases", href: role === "seller" ? "/account/sales" : "/account/orders" }, { label: "Order" }]} />
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h1>Order details</h1>
          <p>Placed {fmtDate(o.created_at)} · {role === "buyer" ? `Sold by ${o.seller_name}` : `Bought by ${o.buyer_name}`}</p>
        </div>
        <OrderStatus status={o.status} label={ORDER_STATUS_LABEL[o.status] ?? o.status} />
      </div>

      {payoutFrozen && (
        <div className="alert alert-warn" role="status">
          <p>{role === "buyer" ? "Your bank is reviewing this payment, so the order is on hold until it decides." : "The buyer's bank is reviewing this payment. Payout is on hold until it decides."}</p>
        </div>
      )}

      <div className="order-grid">
        <div>
          <section className="panel glass" aria-labelledby="items-title">
            <h2 id="items-title">Items</h2>
            <ul className="order-items">
              {items.map((i) => (
                <li key={i.listing_id}>
                  {i.thumbUrl ? <img src={i.thumbUrl} alt="" width={64} height={64} /> : <span />}
                  <Link href={`/listings/${i.listing_id}`}>{i.title}</Link>
                  <span>{formatCents(i.price_cents, true)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel glass" aria-labelledby="progress-title">
            <h2 id="progress-title">Progress</h2>
            <ol className="timeline">
              {steps.map((s) => (
                <li key={s.label} className={s.at ? "done" : ""}>
                  {s.label}
                  {s.at && <time dateTime={new Date(s.at).toISOString()}>{fmtDate(s.at)}</time>}
                </li>
              ))}
            </ol>
            {o.status === "delivered" && releaseAt && (
              <div className="alert alert-info" style={{ marginTop: 8 }}>
                <p>
                  {role === "buyer"
                    ? `Check the item now. If it matches the listing, confirm below. Otherwise report a problem before ${fmtDate(releaseAt)}, when payment is released automatically.`
                    : `The buyer has until ${fmtDate(releaseAt)} to inspect the item. Your payout is released then, or sooner if they confirm.`}
                </p>
              </div>
            )}
          </section>

          {!isPickup && (
            <section className="panel glass" aria-labelledby="ship-title">
              <h2 id="ship-title">Shipping</h2>
              {shipment ? (
                <>
                  <dl className="kv">
                    <dt>Carrier</dt><dd>{shipment.carrier} {shipment.service}</dd>
                    <dt>Tracking</dt><dd style={{ fontFamily: "var(--font-mono)" }}>{shipment.tracking_code}</dd>
                    <dt>Status</dt><dd><strong>{SHIPMENT_STATUS_LABEL[shipment.status] ?? shipment.status}</strong></dd>
                  </dl>
                  <ol className="timeline" style={{ marginTop: 14 }} aria-label="Tracking history">
                    {[...(shipment.events as TrackingEvent[])].reverse().map((ev, k) => (
                      <li key={k} className="done">
                        {ev.message}{ev.location ? `, ${ev.location}` : ""}
                        <time dateTime={ev.at}>{fmtDate(ev.at)}</time>
                      </li>
                    ))}
                  </ol>
                  <div className="actions-row">
                    {role === "seller" && <a className="btn" href={shipment.label_url} target="_blank" rel="noopener noreferrer">Print label</a>}
                    {can.simulateTracking && (
                      <ActionButton endpoint={`/api/orders/${o.id}/simulate-tracking`} className="btn">Simulate carrier update (test)</ActionButton>
                    )}
                  </div>
                </>
              ) : role === "seller" && can.createLabel ? (
                <>
                  <p>Buy a prepaid label at a discounted rate. The buyer gets tracking updates automatically.</p>
                  {shipTo && (
                    <p className="hint">Ships to {shipTo.name}, {shipTo.city}, {shipTo.state} {shipTo.postalCode}</p>
                  )}
                  <div className="actions-row">
                    <ActionButton endpoint={`/api/orders/${o.id}/label`} className="btn btn-primary" pendingText="Buying label…">Create shipping label</ActionButton>
                    {can.cancel && (
                      <ActionButton endpoint={`/api/orders/${o.id}/cancel`} className="btn btn-ghost" confirmText="Cancel this order and refund the buyer in full?">Cancel and refund</ActionButton>
                    )}
                  </div>
                </>
              ) : (
                <p className="hint">{o.status === "paid" ? "The seller is preparing your shipment." : "No shipment."}</p>
              )}
            </section>
          )}

          {isPickup && (
            <section className="panel glass" aria-labelledby="pickup-title">
              <h2 id="pickup-title">Pickup</h2>
              <p className="hint">Meet somewhere public and check the item before confirming collection.</p>
              {accepted && (
                <div className="alert alert-success"><p>Confirmed: <strong>{fmtDate(accepted.starts_at)}</strong> at {accepted.location}{accepted.note ? ` · ${accepted.note}` : ""}</p></div>
              )}
              {proposed && (
                <div className="alert alert-info">
                  <p>{proposed.proposed_by === user.id ? "You proposed" : `${proposed.proposed_by_name} proposed`} {fmtDate(proposed.starts_at)} at {proposed.location}.</p>
                  {proposed.proposed_by !== user.id && (
                    <div className="actions-row">
                      <ActionButton endpoint={`/api/orders/${o.id}/pickup`} body={{ op: "accept", pickupId: proposed.id }} className="btn btn-primary">Accept this time</ActionButton>
                    </div>
                  )}
                </div>
              )}
              {can.confirmCollected && (
                <div className="actions-row">
                  <ActionButton endpoint={`/api/orders/${o.id}/collected`} className="btn btn-primary">I&apos;ve collected the item</ActionButton>
                </div>
              )}
              {can.proposePickup && <PickupForm orderId={o.id} />}
              {can.cancel && (
                <div className="actions-row">
                  <ActionButton endpoint={`/api/orders/${o.id}/cancel`} className="btn btn-ghost" confirmText="Cancel this order and refund the buyer in full?">Cancel and refund</ActionButton>
                </div>
              )}
            </section>
          )}

          {dispute && (
            <section className="panel glass" aria-labelledby="dispute-title">
              <h2 id="dispute-title">Dispute</h2>
              <dl className="kv">
                <dt>Reason</dt><dd>{DISPUTE_REASONS.find((r) => r.value === dispute.reason)?.label ?? dispute.reason}</dd>
                <dt>Status</dt><dd>{dispute.status === "open" ? "Under review: funds on hold" : dispute.status === "resolved_refund" ? `Resolved: buyer refunded ${formatCents(dispute.refund_cents ?? 0, true)}` : "Resolved: payment released to seller"}</dd>
              </dl>
              <p className="quote">{dispute.details}</p>
              {dispute.seller_response && (<><h3>Seller response</h3><p className="quote">{dispute.seller_response}</p></>)}
              {dispute.resolution_note && (<><h3>Trust &amp; Safety decision</h3><p className="quote">{dispute.resolution_note}</p></>)}
              {can.respondDispute && <DisputeResponseForm orderId={o.id} />}
            </section>
          )}

          {can.review && (
            <section className="panel glass" aria-label="Leave a review">
              <ReviewForm orderId={o.id} sellerName={o.seller_name} />
            </section>
          )}
          {review && (
            <section className="panel glass" aria-labelledby="review-title">
              <h2 id="review-title">{role === "buyer" ? "Your review" : "Buyer's review"}</h2>
              <p><Stars rating={review.rating} /> {review.rating}/5</p>
              {review.body && <p className="quote">{review.body}</p>}
            </section>
          )}
        </div>

        <aside>
          <section className="summary glass" aria-labelledby="pay-title" style={{ position: "static" }}>
            <h2 id="pay-title">Payment</h2>
            <dl>
              <dt>Items</dt><dd>{formatCents(o.items_cents, true)}</dd>
              <dt>Shipping</dt><dd>{o.shipping_cents ? formatCents(o.shipping_cents, true) : isPickup ? "Pickup" : "Free"}</dd>
              {role !== "seller" && (<><dt>Buyer protection</dt><dd>{formatCents(o.protection_fee_cents, true)}</dd></>)}
              {role !== "buyer" && (<><dt>Marketplace fee</dt><dd>−{formatCents(o.platform_fee_cents, true)}</dd></>)}
              <dt className="total">{role === "seller" ? "Your payout" : "Total paid"}</dt>
              <dd className="total">{formatCents(role === "seller" ? payout : o.total_cents, true)}</dd>
              {o.refunded_cents > 0 && (<><dt>Refunded</dt><dd>{formatCents(o.refunded_cents, true)}</dd></>)}
            </dl>
            <p className="summary-note"><ShieldIcon /><span>
              {o.status === "completed" ? "Escrow released to the seller." : o.status === "refunded" ? "Refund issued to the original payment method." : `Held in escrow until delivery is confirmed (${config.inspectionWindowHours}h inspection window).`}
            </span></p>
            {can.confirmReceipt && (
              <div style={{ marginTop: 14 }}>
                <ActionButton endpoint={`/api/orders/${o.id}/confirm`} className="btn btn-primary btn-block" confirmText="Confirm the item arrived as described? This releases payment to the seller.">
                  Item is as described: release payment
                </ActionButton>
              </div>
            )}
            {can.dispute && <div style={{ marginTop: 10 }}><DisputeForm orderId={o.id} /></div>}
          </section>
          <section className="panel glass" style={{ marginTop: 16 }}>
            <h2>Need to talk?</h2>
            <p className="hint">Message {otherParty} about this order. Keep all payments on the platform.</p>
            <Link className="btn" href={`/messages`}>Open messages</Link>
            <p className="hint" style={{ marginTop: 12 }}><Link href={`/contact?order=${o.id}`}>Problem with this order? Contact support</Link></p>
            {can.simulateChargeback && (
              <div className="actions-row">
                <ActionButton endpoint="/api/mock/stripe/chargeback" body={{ orderId: o.id, status: "needs_response" }} className="btn" confirmText="Pretend the buyer disputed this charge with their bank?">Simulate card chargeback (test)</ActionButton>
              </div>
            )}
          </section>
        </aside>
      </div>
    </>
  );
}
