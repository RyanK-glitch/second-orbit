"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { api } from "./api";
import { useCart } from "./Cart";
import { Dialog } from "./Dialog";
import { ChatIcon, HeartIcon } from "./icons";

type Props = {
  listingId: string;
  available: boolean;
  isOwner: boolean;
  signedIn: boolean;
  saved: boolean;
  sellerName: string;
};

export function ListingActions({ listingId, available, isOwner, signedIn, saved: initiallySaved, sellerName }: Props) {
  const cart = useCart();
  const router = useRouter();
  const [saved, setSaved] = useState(initiallySaved);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const id = useId();
  const signin = () => router.push(`/signin?next=/listings/${listingId}`);

  if (isOwner) {
    return (
      <div className="pdp-actions">
        <Link className="btn btn-lg" href={`/listings/${listingId}/edit`}>Edit listing</Link>
        <button
          className="btn btn-lg btn-ghost"
          type="button"
          onClick={async () => {
            if (!confirm("Remove this listing? Buyers will no longer see it.")) return;
            const r = await api(`/api/listings/${listingId}`, "DELETE");
            if (r.ok) router.push("/account/listings");
            else setError(r.error);
          }}
        >
          Remove listing
        </button>
        {error && <p className="error" role="alert">{error}</p>}
      </div>
    );
  }

  async function buyNow() {
    if (!signedIn) return signin();
    setBusy(true);
    setError(null);
    const r = await api<{ url: string }>("/api/checkout", "POST", { listingIds: [listingId] });
    if (r.ok && r.data) {
      cart.add(listingId);
      window.location.assign(r.data.url);
    } else {
      setBusy(false);
      setError(r.error);
    }
  }

  async function toggleSave() {
    if (!signedIn) return signin();
    const next = !saved;
    setSaved(next);
    const r = await api(`/api/saved/${listingId}`, next ? "PUT" : "DELETE");
    if (!r.ok) {
      setSaved(!next);
      setError(r.error);
    } else setMsg(next ? "Saved to your list." : "Removed from saved items.");
  }

  async function sendMessage(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = String(new FormData(e.currentTarget).get("body") ?? "");
    const r = await api<{ conversationId: string }>("/api/conversations", "POST", { listingId, body });
    if (r.ok && r.data) router.push(`/messages/${r.data.conversationId}`);
    else setError(r.fieldErrors.body ?? r.error);
  }

  const inCart = cart.has(listingId);
  return (
    <>
      <div className="pdp-actions">
        {!available ? (
          <button className="btn btn-lg" type="button" disabled>Sold</button>
        ) : inCart ? (
          <Link className="btn btn-lg" href="/cart">In your cart: view cart</Link>
        ) : (
          <button className="btn btn-lg" type="button" onClick={() => { cart.add(listingId); setMsg("Added to your cart."); }}>
            Add to cart
          </button>
        )}
        {available && (
          <button className="btn btn-lg btn-primary" type="button" onClick={buyNow} disabled={busy}>
            {busy ? "Opening secure checkout…" : "Buy now"}
          </button>
        )}
      </div>
      <div className="actions-row" style={{ marginTop: -8, marginBottom: 16 }}>
        <button className="btn" type="button" aria-pressed={saved} onClick={toggleSave}>
          <HeartIcon filled={saved} /> {saved ? "Saved" : "Save"}
        </button>
        <button className="btn" type="button" onClick={() => (signedIn ? setChatOpen(true) : signin())}>
          <ChatIcon size={18} /> Message seller
        </button>
      </div>
      <div role="status" aria-live="polite" className="visually-hidden">{msg}</div>
      {error && <div className="alert alert-error" role="alert"><p>{error}</p></div>}
      <Dialog open={chatOpen} onClose={() => setChatOpen(false)} labelledBy={`${id}-chat`}>
        <form onSubmit={sendMessage}>
          <h2 id={`${id}-chat`}>Message {sellerName}</h2>
          <p className="hint">Keep payment on the platform. Escrow protection only covers orders paid through checkout.</p>
          <div className="field">
            <label htmlFor={`${id}-body`}>Your message</label>
            <textarea className="textarea" id={`${id}-body`} name="body" required minLength={1} maxLength={2000} defaultValue="Hi! Is this still available?" />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setChatOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Send message</button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
