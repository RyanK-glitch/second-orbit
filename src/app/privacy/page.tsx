import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" intro="What we collect, why, and the control you have over it.">
      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details:</strong> your email, display name, area, bio and, if you ship items, your ship-from address.</li>
        <li><strong>Orders:</strong> what you bought or sold, amounts, delivery details and tracking.</li>
        <li><strong>Content you create:</strong> listings, photos, messages, reviews, reports and disputes.</li>
        <li><strong>Verification:</strong> only the result of an ID check. Documents go straight to Stripe Identity and never reach us.</li>
        <li><strong>Social sign-in:</strong> the identifier and email Google, Apple or Facebook share with us.</li>
      </ul>
      <p>We never see or store card numbers: they&apos;re entered on pages hosted by Stripe. Passwords are stored only as salted scrypt hashes, and two-factor secrets are encrypted.</p>
      <h2>Who we share it with</h2>
      <ul>
        <li><strong>The other person in an order:</strong> your display name, plus your delivery address if you&apos;re the buyer.</li>
        <li><strong>Stripe:</strong> payments, seller payouts and ID checks.</li>
        <li><strong>EasyPost:</strong> addresses needed to buy shipping labels.</li>
        <li><strong>Resend:</strong> your email address, to send order and account emails.</li>
        <li><strong>Google, Apple and Meta:</strong> only if you sign in with them.</li>
        <li><strong>Plausible:</strong> cookieless, aggregate visit counts. No personal data.</li>
      </ul>
      <h2>Your rights</h2>
      <ul>
        <li><strong>Get a copy:</strong> use &ldquo;Download my data&rdquo; in <Link href="/account/settings">Settings</Link> for a JSON file of what we hold about you.</li>
        <li><strong>Correct it:</strong> edit your profile in Settings at any time.</li>
        <li><strong>Delete it:</strong> use &ldquo;Delete account&rdquo; in Settings once your orders are finished.</li>
      </ul>
      <h2>What deleting your account does</h2>
      <p>Your email, name, profile, addresses, sign-in methods, unsold listings and their photos are removed. Your messages are replaced with a short notice, and your reviews lose their text but keep their star rating, so sellers&apos; scores don&apos;t change. We keep anonymised order and payment records because tax and accounting rules require them, along with the payout account reference needed to settle any later chargeback.</p>
      <h2>Questions</h2>
      <p>Use the <Link href="/contact">contact form</Link> and choose &ldquo;Privacy request&rdquo;.</p>
    </LegalPage>
  );
}
