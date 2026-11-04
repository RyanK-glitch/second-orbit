import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { config } from "@/lib/env";

export const metadata: Metadata = { title: "Seller agreement" };
export const dynamic = "force-dynamic";

export default function SellerAgreementPage() {
  return (
    <LegalPage title="Seller agreement" intro="What we expect from sellers, and what you can expect from us.">
      <h2>Before you list</h2>
      <p>You need to pass an ID check and connect a payout account. Your identity is checked by Stripe, and we only keep the result.</p>
      <h2>Describing your item</h2>
      <p>Choose the condition grade honestly, photograph any wear, and list only items you own and are allowed to sell. <Link href="/prohibited-items">Some items aren&apos;t allowed</Link>.</p>
      <h2>Getting paid</h2>
      <p>After a sale, ship the item or arrange pickup. The buyer then has {config.inspectionWindowHours} hours to inspect it. Payment is released when they confirm, or automatically when that window ends. You receive the item price and shipping, less the <Link href="/fees">marketplace fee</Link>.</p>
      <h2>Disputes</h2>
      <p>If a buyer opens a dispute, your payout is held and you can respond with your side. Our team may refund the buyer in part or in full, or release payment to you.</p>
      <h2>Chargebacks</h2>
      <p>If a buyer disputes the card payment with their bank, your payout is held until the bank decides. We send the order records to the bank for you. If the bank rules for the buyer, the payment is returned to them, and if you were already paid, that payout is reversed.</p>
      <h2>Cancelling</h2>
      <p>You can cancel and fully refund an order before it ships. Repeated cancellations may affect your account.</p>
    </LegalPage>
  );
}
