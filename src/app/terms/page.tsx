import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { APP_NAME } from "@/lib/brand";
import { config } from "@/lib/env";

export const metadata: Metadata = { title: "Terms of Service" };
export const dynamic = "force-dynamic";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" intro="The rules for using the marketplace.">
      <h2>Your account</h2>
      <p>You must be 18 or over and give accurate details. You&apos;re responsible for what happens under your account, so keep your password private. You can delete your account at any time in Settings, unless an order or chargeback is still open.</p>
      <h2>What {APP_NAME} does</h2>
      <p>{APP_NAME} connects people buying and selling pre-owned items. Sellers, not {APP_NAME}, own what they list and are responsible for describing it honestly.</p>
      <h2>Buying</h2>
      <p>Payment is taken at checkout and held until you have the item. You then have {config.inspectionWindowHours} hours to confirm it matches the listing or report a problem. If you do neither, payment goes to the seller automatically. See <Link href="/buyer-protection">Buyer protection</Link>.</p>
      <h2>Selling</h2>
      <p>Sellers must verify their identity and connect a payout account before listing. The <Link href="/seller-agreement">Seller agreement</Link> and <Link href="/fees">fees</Link> apply.</p>
      <h2>Disputes and chargebacks</h2>
      <p>If something goes wrong, open a dispute on the order and our team will decide it, refunding the buyer or releasing payment to the seller. If a buyer disputes a card payment with their bank instead, all payouts on that payment are frozen until the bank decides, and the bank&apos;s decision is final.</p>
      <h2>Conduct</h2>
      <p>Don&apos;t list <Link href="/prohibited-items">prohibited items</Link>, harass other members, or take payment off the platform. We may remove listings and suspend accounts that break these rules.</p>
      <h2>Liability</h2>
      <p>The service is provided as it is. We aren&apos;t liable for indirect losses, and nothing here limits rights you have by law.</p>
    </LegalPage>
  );
}
