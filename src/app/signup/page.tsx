import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { SocialSignIn } from "@/components/SocialSignIn";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/http";

export const metadata: Metadata = { title: "Create an account", robots: { index: false } };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const target = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(target);
  return (
    <div className="auth-wrap">
      <div className="glass">
        <h1>Create your account</h1>
        <p className="hint" style={{ marginBottom: 18 }}>Buy right away. To sell, you&apos;ll verify your ID and connect payouts.</p>
        <SocialSignIn next={target} />
        <AuthForm mode="signup" next={target} />
      </div>
    </div>
  );
}
