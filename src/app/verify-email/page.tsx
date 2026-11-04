import type { Metadata } from "next";
import { SimpleForm } from "@/components/SimpleForm";

export const metadata: Metadata = { title: "Confirm your email", robots: { index: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="auth-wrap">
      <div className="glass">
        <h1>Confirm your email</h1>
        {token ? (
          <SimpleForm endpoint="/api/auth/email/verify" fields={[]} extra={{ token }} submit="Confirm my email" success="Thanks, your email is confirmed." />
        ) : (
          <div className="alert alert-error" role="alert"><p>This link is incomplete. You can request a new one in Settings.</p></div>
        )}
      </div>
    </div>
  );
}
