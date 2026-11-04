import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { config } from "@/lib/env";

export const metadata: Metadata = { title: "Buyer protection" };
export const dynamic = "force-dynamic";

export default function BuyerProtectionPage() {
  return (
    <LegalPage title="Buyer protection and refunds" intro="Your payment stays on hold until you have the item.">
      <h2>How it works</h2>
      <ol>
        <li>You pay at checkout, and we hold the payment.</li>
        <li>The seller ships the item or meets you for pickup.</li>
        <li>You get {config.inspectionWindowHours} hours after delivery to check that it matches the listing.</li>
        <li>You confirm, or the window ends, and the seller is paid.</li>
      </ol>
      <h2>If something&apos;s wrong</h2>
      <p>Open a dispute from your order before the window ends. It covers items that didn&apos;t arrive, don&apos;t match the listing, arrived damaged, or are counterfeit. The payment stays on hold, the seller can respond, and our team decides the outcome.</p>
      <h2>Refunds</h2>
      <p>Refunds go back to your original payment method. They can be full or partial, depending on the decision. If a seller cancels before shipping, you&apos;re refunded in full.</p>
      <h2>Returns</h2>
      <p>Return shipping isn&apos;t arranged through the site yet, so our team will agree the next step with you on each dispute.</p>
      <h2>Need help?</h2>
      <p><Link href="/contact">Contact us</Link> or read the <Link href="/help">help pages</Link>.</p>
    </LegalPage>
  );
}
