import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockOAuthConsent } from "@/components/MockOAuthConsent";
import { PROVIDER_LABEL, redirectUriFor } from "@/lib/auth/oauth/providers";
import { oauthProviders, type OAuthProviderId } from "@/lib/env";

export const metadata: Metadata = { title: "Test social sign-in", robots: { index: false } };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ provider: string }>; searchParams: Promise<{ state?: string; nonce?: string; redirect_uri?: string }> };

/** Stand-in for the Google / Apple / Facebook consent screens (OAUTH_MOCK=1 on localhost only). */
export default async function MockOAuth({ params, searchParams }: Props) {
  if (oauthProviders().mode !== "mock") notFound();
  const { provider } = await params;
  if (!(provider in PROVIDER_LABEL)) notFound();
  const id = provider as OAuthProviderId;
  const { state = "", nonce = "", redirect_uri } = await searchParams;
  // Only ever return to our own callback.
  if (redirect_uri !== redirectUriFor(id)) notFound();
  return (
    <div className="auth-wrap" style={{ maxWidth: 560 }}>
      <div className="glass">
        <span className="eyebrow">Mock {PROVIDER_LABEL[id]} sign-in · test mode</span>
        <h1>Continue with {PROVIDER_LABEL[id]}</h1>
        <div className="alert alert-info">
          <p>With real keys you&apos;d see {PROVIDER_LABEL[id]}&apos;s own consent screen. Choose the identity it should report.</p>
        </div>
        <MockOAuthConsent provider={id} state={state} nonce={nonce} callback={redirect_uri} />
      </div>
    </div>
  );
}
