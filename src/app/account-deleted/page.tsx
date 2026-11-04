import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Account deleted", robots: { index: false } };

export default function AccountDeletedPage() {
  return (
    <div className="auth-wrap">
      <div className="glass">
        <h1>Your account has been deleted</h1>
        <p>Your personal details, listings, messages and sign-in methods are gone. We keep anonymised order records because tax and accounting rules require them.</p>
        <Link className="btn btn-primary" href="/">Back to the shop</Link>
      </div>
    </div>
  );
}
