"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { CartIcon } from "./icons";

/**
 * The cart is a list of listing ids kept in localStorage (every item is
 * one-of-a-kind, so there are no quantities). Prices are always re-read from
 * the server, and checkout re-validates availability.
 */
const KEY = "so.cart.v1";

type CartCtx = {
  ids: string[];
  ready: boolean;
  has: (id: string) => boolean;
  add: (id: string) => void;
  remove: (id: string) => void;
  removeMany: (ids: string[]) => void;
  clear: () => void;
};

const Ctx = createContext<CartCtx | null>(null);

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setIds(read());
    setReady(true);
    const onStorage = (e: StorageEvent) => e.key === KEY && setIds(read());
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const persist = useCallback((next: string[]) => {
    setIds(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: cart lives for this tab only */
    }
  }, []);

  const value = useMemo<CartCtx>(
    () => ({
      ids,
      ready,
      has: (id) => ids.includes(id),
      add: (id) => !ids.includes(id) && persist([...ids, id].slice(-20)),
      remove: (id) => persist(ids.filter((x) => x !== id)),
      removeMany: (drop) => persist(ids.filter((x) => !drop.includes(x))),
      clear: () => persist([]),
    }),
    [ids, ready, persist],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart must be used inside CartProvider");
  return c;
}

export function CartLink() {
  const { ids } = useCart();
  const n = ids.length;
  return (
    <Link className="icon-btn" href="/cart" aria-label={`Cart, ${n} item${n === 1 ? "" : "s"}`}>
      <CartIcon />
      {n > 0 && <span className="badge-count">{n}</span>}
    </Link>
  );
}

/** Clears purchased items after a successful checkout. */
export function ClearCart({ ids }: { ids: string[] }) {
  const { removeMany, ready } = useCart();
  useEffect(() => {
    if (ready) removeMany(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return null;
}
