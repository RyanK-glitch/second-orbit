import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { config } from "@/lib/env";

export const metadata: Metadata = { title: "Help" };
export const dynamic = "force-dynamic";

const FAQS: { q: string; a: React.ReactNode }[] = [
  { q: "I forgot my password", a: <>Use <Link href="/forgot-password">Forgot your password?</Link> on the sign-in page. The link works for one hour and signs out every device.</> },
  { q: "I lost my phone and can't get a two-factor code", a: <>Enter one of the recovery codes you saved during setup. If you don&apos;t have any, <Link href="/contact">contact us</Link>.</> },
  { q: "Where is my order?", a: <>Open it from <Link href="/account/orders">Purchases</Link> to see its tracking and progress.</> },
  { q: "The item isn't what I expected", a: <>Open a dispute from your order before the inspection window ends. See <Link href="/buyer-protection">Buyer protection</Link>.</> },
  { q: "How much does it cost to sell?", a: <>Listing is free. See <Link href="/fees">Fees</Link>.</> },
  { q: "When do I get paid?", a: `When the buyer confirms the item, or ${config.inspectionWindowHours} hours after delivery if they don't report a problem.` },
  { q: "Why is my payout on hold?", a: "The buyer opened a dispute, or their bank is reviewing the card payment. The order page shows which." },
  { q: "How do I get a copy of my data, or delete my account?", a: <>Both are in <Link href="/account/settings">Settings</Link>. You can delete your account once your orders are finished.</> },
];

export default function HelpPage() {
  return (
    <LegalPage title="Help" intro="Answers to the most common questions.">
      {FAQS.map((f) => (
        <section key={f.q}>
          <h2>{f.q}</h2>
          <p>{f.a}</p>
        </section>
      ))}
      <h2>Still stuck?</h2>
      <p><Link className="btn" href="/contact">Contact us</Link></p>
    </LegalPage>
  );
}
