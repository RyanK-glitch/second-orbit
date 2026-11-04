import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { config } from "@/lib/env";
import { computeFees, formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Fees" };
export const dynamic = "force-dynamic";

const percent = (bps: number) => `${bps / 100}%`;

/** Rates and the worked example come from the same code checkout uses, so this page can't drift. */
export default function FeesPage() {
  const example = computeFees(10000, 800);
  return (
    <LegalPage title="Fees" intro="It's free to list. Fees apply only when an item sells.">
      <h2>Buyers</h2>
      <p>A buyer protection fee of {percent(config.buyerProtectionBps)} of the item price, with a minimum of {formatCents(100, true)}, is added at checkout.</p>
      <h2>Sellers</h2>
      <p>A marketplace fee of {percent(config.platformFeeBps)} of the item price comes off your payout. Shipping isn&apos;t charged a fee.</p>
      <h2>Example</h2>
      <p>A {formatCents(example.itemsCents, true)} item with {formatCents(example.shippingCents, true)} shipping:</p>
      <dl className="kv">
        <dt>Buyer pays</dt><dd>{formatCents(example.totalCents, true)} (including {formatCents(example.protectionFeeCents, true)} buyer protection)</dd>
        <dt>Seller receives</dt><dd>{formatCents(example.sellerPayoutCents, true)} (after a {formatCents(example.platformFeeCents, true)} marketplace fee)</dd>
      </dl>
    </LegalPage>
  );
}
