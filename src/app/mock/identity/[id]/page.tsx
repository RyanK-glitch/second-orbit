import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { requirePageUser } from "@/lib/auth/page";
import { isMock } from "@/lib/env";

export const metadata: Metadata = { title: "Test ID verification", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Stand-in for Stripe Identity's hosted document + selfie check. */
export default async function MockIdentity({ params }: { params: Promise<{ id: string }> }) {
  if (!isMock("identity")) notFound();
  const { id } = await params;
  await requirePageUser(`/mock/identity/${id}`);
  return (
    <div className="auth-wrap" style={{ maxWidth: 560 }}>
      <div className="glass">
        <span className="eyebrow">Mock Stripe Identity · test mode</span>
        <h1>Verify your identity</h1>
        <div className="alert alert-info">
          <p>With Stripe keys set, you&apos;d photograph an ID document and take a selfie on verify.stripe.com. No documents are collected here. Choose an outcome to simulate.</p>
        </div>
        <div className="form-actions">
          <ActionButton endpoint={`/api/mock/identity/${encodeURIComponent(id)}`} body={{ result: "failed" }} className="btn btn-ghost">Simulate failure</ActionButton>
          <ActionButton endpoint={`/api/mock/identity/${encodeURIComponent(id)}`} body={{ result: "verified" }} className="btn btn-primary btn-lg">Simulate successful verification</ActionButton>
        </div>
      </div>
    </div>
  );
}
