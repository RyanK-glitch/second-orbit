import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { requirePageUser } from "@/lib/auth/page";
import { isMock } from "@/lib/env";

export const metadata: Metadata = { title: "Test payout setup", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Stand-in for Stripe Connect's hosted onboarding. */
export default async function MockOnboarding() {
  if (!isMock("payments")) notFound();
  await requirePageUser("/account/settings");
  return (
    <div className="auth-wrap" style={{ maxWidth: 560 }}>
      <div className="glass">
        <span className="eyebrow">Mock Stripe Connect · test mode</span>
        <h1>Set up payouts</h1>
        <div className="alert alert-info">
          <p>With Stripe test keys, this step happens on connect.stripe.com, where Stripe collects bank and tax details. Nothing is collected here.</p>
        </div>
        <ActionButton endpoint="/api/mock/stripe/onboarding" className="btn btn-primary btn-lg btn-block">Complete test onboarding</ActionButton>
      </div>
    </div>
  );
}
