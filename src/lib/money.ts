import { config } from "./env";

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

/** Formats cents; whole dollars drop the ".00" unless `exact`. */
export function formatCents(cents: number, exact = false): string {
  return (exact || cents % 100 !== 0 ? usd2 : usd0).format(cents / 100);
}

export function savingsPct(price: number, original: number): number {
  return original > price ? Math.round((1 - price / original) * 100) : 0;
}

export type Fees = {
  itemsCents: number;
  shippingCents: number;
  protectionFeeCents: number;
  platformFeeCents: number;
  totalCents: number;
  sellerPayoutCents: number;
};

/**
 * Buyer pays items + shipping + buyer protection.
 * Seller receives items + shipping − platform fee (paid out at release).
 * The platform keeps protection + platform fee.
 */
export function computeFees(
  itemsCents: number,
  shippingCents: number,
  bps = { protection: config.buyerProtectionBps, platform: config.platformFeeBps },
): Fees {
  const protectionFeeCents = itemsCents > 0 ? Math.max(100, Math.round((itemsCents * bps.protection) / 10000)) : 0;
  const platformFeeCents = Math.round((itemsCents * bps.platform) / 10000);
  return {
    itemsCents,
    shippingCents,
    protectionFeeCents,
    platformFeeCents,
    totalCents: itemsCents + shippingCents + protectionFeeCents,
    sellerPayoutCents: itemsCents + shippingCents - platformFeeCents,
  };
}

/** Parses "12.50" style user input into cents. */
export function dollarsToCents(v: string | number): number {
  const n = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}
