import type { Metadata } from "next";
import Link from "next/link";
import { SimpleForm } from "@/components/SimpleForm";

// The token is in the URL, so the page itself must never be indexed.
export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div className="auth-wrap">
      <div className="glass">
        <h1>Choose a new password</h1>
        {token ? (
          <SimpleForm
            endpoint="/api/auth/password/reset"
            fields={[{ name: "password", label: "New password", type: "password", autoComplete: "new-password", hint: "At least 10 characters." }]}
            extra={{ token }}
            submit="Save new password"
          />
        ) : (
          <div className="alert alert-error" role="alert"><p>This link is incomplete. <Link href="/forgot-password">Request a new one</Link>.</p></div>
        )}
      </div>
    </div>
  );
}
