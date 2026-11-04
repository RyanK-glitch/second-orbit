import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SimpleForm } from "@/components/SimpleForm";
import { hasPendingChallenge } from "@/lib/auth/two-factor";
import { safeNext } from "@/lib/http";

export const metadata: Metadata = { title: "Two-factor sign-in", robots: { index: false } };

export default async function TwoFactorPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const target = safeNext((await searchParams).next);
  if (!(await hasPendingChallenge())) redirect(`/signin?next=${encodeURIComponent(target)}`);
  return (
    <div className="auth-wrap">
      <div className="glass">
        <h1>Enter your code</h1>
        <p className="hint">Open your authenticator app, or use one of your recovery codes.</p>
        <SimpleForm
          endpoint="/api/auth/two-factor"
          fields={[{ name: "code", label: "Authentication code", autoComplete: "one-time-code" }]}
          extra={{ next: target }}
          submit="Verify"
        />
        <p style={{ marginTop: 16, textAlign: "center" }}><Link href="/signin">Start again</Link></p>
      </div>
    </div>
  );
}
