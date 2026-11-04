import type { Metadata } from "next";
import Link from "next/link";
import { SimpleForm } from "@/components/SimpleForm";
import { isLocalApp, isMock } from "@/lib/env";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <div className="auth-wrap">
      <div className="glass">
        <h1>Reset your password</h1>
        <p className="hint">Enter your account email and we&apos;ll send you a link to choose a new password.</p>
        <SimpleForm
          endpoint="/api/auth/password/forgot"
          fields={[{ name: "email", label: "Email", type: "email", autoComplete: "email" }]}
          submit="Send reset link"
          success="If that address has an account, a reset link is on its way. It works for one hour."
        />
        {isMock("email") && isLocalApp() && (
          <p className="demo-creds">Test mode: nothing is really emailed. Open the <Link href="/mock/inbox">test inbox</Link> to find the link.</p>
        )}
        <p style={{ marginTop: 16, textAlign: "center" }}><Link href="/signin">Back to sign in</Link></p>
      </div>
    </div>
  );
}
