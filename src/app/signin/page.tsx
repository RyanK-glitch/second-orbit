import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { SocialSignIn } from "@/components/SocialSignIn";
import { getCurrentUser } from "@/lib/auth/session";
import { safeNext } from "@/lib/http";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

type Props = { searchParams: Promise<{ next?: string; suspended?: string; oauth_error?: string; reset?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const { next, suspended, oauth_error, reset } = await searchParams;
  const target = safeNext(next);
  if (await getCurrentUser()) redirect(target);
  return (
    <div className="auth-wrap">
      <div className="glass">
        <h1>Sign in</h1>
        {reset && <div className="alert alert-success" role="status"><p>Your password has been changed. Please sign in.</p></div>}
        {suspended && <div className="alert alert-error" role="alert"><p>This account is suspended.</p></div>}
        <SocialSignIn next={target} error={oauth_error} />
        <AuthForm mode="signin" next={target} />
        {process.env.NODE_ENV !== "production" || process.env.SHOW_DEMO_ACCOUNTS === "1" ? (
          <p className="demo-creds">
            Demo accounts (password <code>demo-password-1</code>): <code>buyer@example.com</code>, seller{" "}
            <code>maya@example.com</code>, moderator <code>mod@example.com</code>, admin <code>admin@example.com</code>.
          </p>
        ) : null}
      </div>
    </div>
  );
}
