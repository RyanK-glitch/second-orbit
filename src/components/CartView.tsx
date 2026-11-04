"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CartQuote } from "@/lib/cart";
import type { Condition } from "@/lib/catalog";
import { formatCents } from "@/lib/money";
import { api } from "./api";
import { GradeBadge } from "./bits";
import { useCart } from "./Cart";
import { ShieldIcon, TruckIcon } from "./icons";

export function CartView({ signedIn }: { signedIn: boolean }) {
  const cart = useCart();
  const [quote, setQuote] = useState<CartQuote | null>(null);
  const [announce, setAnnounce] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const key = cart.ids.join(",");

  useEffect(() => {
    if (!cart.ready) return;
    if (!cart.ids.length) {
      setQuote({ items: [], totals: { itemsCents: 0, shippingCents: 0, protectionFeeCents: 0, totalCents: 0, savingsCents: 0, count: 0 }, unavailable: [] });
      return;
    }
    let cancelled = false;
    fetch(`/api/cart?ids=${encodeURIComponent(key)}`)
      .then((r) => r.json())
      .then((q: CartQuote) => !cancelled && setQuote(q))
      .catch(() => !cancelled && setError("Couldn't load your cart. Please refresh."));
    return () => {
      cancelled = true;
    };
  }, [key, cart.ready, cart.ids.length]);

  if (!quote) return <p role="status">Loading your cart…</p>;

  if (!quote.items.length) {
    return (
      <div className="empty glass">
        <h2>Your cart is empty</h2>
        <p>Pre-owned items sell fast. Have a look at what&apos;s just been listed.</p>
        <Link className="btn btn-primary" href="/shop?sort=newest">Browse new listings</Link>
      </div>
    );
  }

  const t = quote.totals;

  async function checkout() {
    if (!signedIn) {
      window.location.href = "/signin?next=/cart";
      return;
    }
    setBusy(true);
    setError(null);
    const ids = quote!.items.filter((i) => i.available).map((i) => i.id);
    const r = await api<{ url: string }>("/api/checkout", "POST", { listingIds: ids });
    if (r.ok && r.data) window.location.assign(r.data.url);
    else {
      setBusy(false);
      setError(r.error);
    }
  }

  return (
    <div className="cart-layout">
      <section aria-labelledby="cart-items-title">
        <h2 id="cart-items-title" className="visually-hidden" ref={headingRef} tabIndex={-1}>Items</h2>
        {quote.unavailable.length > 0 && (
          <div className="alert alert-warn" role="status">
            <p>Some items were just sold or removed. They won&apos;t be included at checkout.</p>
          </div>
        )}
        <ul className="cart-list">
          {quote.items.map((item) => (
            <li key={item.id} className="cart-item glass" style={item.available ? undefined : { opacity: 0.6 }}>
              {item.thumbUrl ? <img src={item.thumbUrl} alt="" width={96} height={96} /> : <span />}
              <div>
                <h3><Link href={`/listings/${item.id}`}>{item.title}</Link></h3>
                <div className="cart-item-meta">
                  <GradeBadge condition={item.condition as Condition} />
                  <span>Sold by {item.sellerName}</span>
                  {!item.available && <span className="pill pill-sold">No longer available</span>}
                </div>
                <div className="cart-item-meta" style={{ marginTop: 4 }}>
                  <TruckIcon />
                  <span>{item.pickupOnly ? `Pickup only, ${item.sellerLocation}` : item.shippingCents ? `${formatCents(item.shippingCents, true)} shipping` : "Free shipping"}</span>
                </div>
              </div>
              <div className="cart-item-side">
                <span className="price">{formatCents(item.priceCents, true)}</span>
                <span className="seller-meta">One of a kind</span>
                <button
                  className="btn-danger-text"
                  type="button"
                  onClick={() => {
                    cart.remove(item.id);
                    setAnnounce(`Removed ${item.title}.`);
                    headingRef.current?.focus();
                  }}
                >
                  Remove<span className="visually-hidden"> {item.title}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <aside className="summary glass" aria-labelledby="sum-title">
        <h2 id="sum-title">Order summary</h2>
        <div aria-live="polite">
          <dl>
            <dt>Items ({t.count})</dt><dd>{formatCents(t.itemsCents, true)}</dd>
            <dt>Shipping</dt><dd>{t.shippingCents ? formatCents(t.shippingCents, true) : "Free / pickup"}</dd>
            <dt>Buyer protection</dt><dd>{formatCents(t.protectionFeeCents, true)}</dd>
            <dt className="total">Total</dt><dd className="total">{formatCents(t.totalCents, true)}</dd>
            {t.savingsCents > 0 && (<><dt className="saved">You save vs. new</dt><dd className="saved">{formatCents(t.savingsCents, true)}</dd></>)}
          </dl>
        </div>
        {error && <div className="alert alert-error" role="alert" style={{ marginTop: 14 }}><p>{error}</p></div>}
        <button className="btn btn-primary btn-lg btn-block" type="button" onClick={checkout} disabled={busy || t.count === 0}>
          {busy ? "Opening secure checkout…" : signedIn ? "Checkout securely" : "Sign in to check out"}
        </button>
        <Link className="btn btn-ghost btn-block" href="/shop" style={{ marginTop: 8 }}>Keep shopping</Link>
        <p className="summary-note">
          <ShieldIcon />
          <span>Payment is taken on a Stripe-hosted page and held in escrow until you confirm delivery. We never see your card details.</span>
        </p>
        <div className="visually-hidden" role="status">{announce}</div>
      </aside>
    </div>
  );
}
