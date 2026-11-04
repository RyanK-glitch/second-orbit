import type { Metadata } from "next";
import { ActionButton } from "@/components/ActionButton";
import { DisconnectProvider } from "@/components/ConnectedAccounts";
import { ProfileForm } from "@/components/ProfileForm";
import { ProviderIcon } from "@/components/SocialSignIn";
import { SellerOnboarding } from "@/components/SellerOnboarding";
import { SimpleForm, type FormField } from "@/components/SimpleForm";
import { TwoFactorPanel } from "@/components/TwoFactorPanel";
import { deletionBlockers } from "@/lib/account";
import { requirePageUser } from "@/lib/auth/page";
import { linkedAccounts } from "@/lib/auth/oauth/flow";
import { OAUTH_ERRORS, type OAuthErrorCode } from "@/lib/auth/oauth/policy";
import { PROVIDER_LABEL } from "@/lib/auth/oauth/providers";
import { recoveryCodesLeft } from "@/lib/auth/two-factor";
import { config, integrations, oauthProviders } from "@/lib/env";
import type { Address } from "@/lib/integrations/types";
import { getProfile } from "@/lib/users";

export const metadata: Metadata = { title: "Settings" };

type Props = { searchParams: Promise<{ linked?: string; oauth_error?: string; two_factor?: string }> };

export default async function Settings({ searchParams }: Props) {
  const user = await requirePageUser("/account/settings");
  const [p, linked, { linked: justLinked, oauth_error, two_factor }, codesLeft, blockers] = await Promise.all([
    getProfile(user.id),
    linkedAccounts(user.id),
    searchParams,
    recoveryCodesLeft(user.id),
    deletionBlockers(user),
  ]);
  const staffMustKeep2fa = user.role !== "user" && config.staffTwoFactorRequired;
  const deleteFields: FormField[] = [
    ...(p.has_password ? [{ name: "password", label: "Your password", type: "password" as const, autoComplete: "current-password" }] : []),
    ...(user.twoFactorEnabled ? [{ name: "code", label: "Authentication code", autoComplete: "one-time-code" }] : []),
    { name: "confirmEmail", label: `Type ${p.email} to confirm`, type: "email", autoComplete: "off" },
  ];
  const mode = integrations();
  const { enabled } = oauthProviders();
  const linkedIds = new Set(linked.map((a) => a.provider as string));
  const providers = [...new Set([...enabled, ...linkedIds])] as (keyof typeof PROVIDER_LABEL)[];
  return (
    <>
      <div className="page-head"><h1>Settings</h1><p>Signed in as {p.email}.</p></div>
      {!p.email_verified_at && (
        <div className="alert alert-warn">
          <p>Please confirm your email so we can reach you about your orders. Check your inbox for the link.</p>
          <div className="actions-row"><ActionButton endpoint="/api/auth/email/resend" className="btn">Send a new link</ActionButton></div>
        </div>
      )}
      <section className="panel glass" aria-labelledby="profile-title">
        <h2 id="profile-title">Profile</h2>
        <ProfileForm displayName={p.display_name} location={p.location} bio={p.bio} shipFrom={p.ship_from as Address | null} />
      </section>
      {providers.length > 0 && (
        <section className="panel glass" aria-labelledby="connected-title">
          <h2 id="connected-title">Connected accounts</h2>
          <p className="hint">Sign in with these as well as your password.</p>
          {justLinked && justLinked in PROVIDER_LABEL && (
            <div className="alert alert-success" role="status"><p>{PROVIDER_LABEL[justLinked as keyof typeof PROVIDER_LABEL]} is now connected.</p></div>
          )}
          {oauth_error && (
            <div className="alert alert-error" role="alert"><p>{OAUTH_ERRORS[oauth_error as OAuthErrorCode] ?? OAUTH_ERRORS.failed}</p></div>
          )}
          <ul className="connected-list">
            {providers.map((id) => {
              const account = linked.find((a) => a.provider === id);
              return (
                <li key={id}>
                  <ProviderIcon id={id} />
                  <span>
                    <strong>{PROVIDER_LABEL[id]}</strong>
                    <span className="hint">{account ? ` · ${account.is_private_email ? "Private relay email" : account.email ?? "Connected"}` : " · Not connected"}</span>
                  </span>
                  {account ? (
                    <DisconnectProvider provider={id} label={PROVIDER_LABEL[id]} />
                  ) : enabled.includes(id) ? (
                    <form action={`/api/auth/oauth/${id}`} method="post">
                      <input type="hidden" name="intent" value="link" />
                      <button type="submit" className="btn">Connect {PROVIDER_LABEL[id]}</button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section className="panel glass" id="security" aria-labelledby="security-title">
        <h2 id="security-title">Two-factor sign-in</h2>
        {two_factor === "required" && !user.twoFactorEnabled && (
          <div className="alert alert-warn" role="alert"><p>Staff need two-factor sign-in to use the back office. Set it up here to continue.</p></div>
        )}
        <TwoFactorPanel enabled={user.twoFactorEnabled} codesLeft={codesLeft} canDisable={!staffMustKeep2fa} />
      </section>
      <SellerOnboarding verification={p.verification_status} payoutsEnabled={p.payouts_enabled} />
      <section className="panel glass" aria-labelledby="privacy-title">
        <h2 id="privacy-title">Privacy</h2>
        <ul>
          <li>Card details are entered only on Stripe-hosted pages. We never receive or store them.</li>
          <li>ID documents go straight to Stripe Identity; we only store the verification result.</li>
          <li>Photos are re-encoded on upload, which strips location and camera metadata.</li>
          <li>Analytics are cookieless and aggregate ({mode.analytics === "plausible" ? "Plausible" : "local only in this environment"}).</li>
        </ul>
        <div className="actions-row">
          <a className="btn" href="/api/account/export" download>Download my data</a>
        </div>
      </section>
      <section className="panel glass" aria-labelledby="delete-title">
        <h2 id="delete-title">Delete account</h2>
        <p>This removes your profile, listings, messages and sign-in methods, and can&apos;t be undone. Anonymised order records stay, because tax and accounting rules require them.</p>
        {blockers.length > 0 ? (
          <div className="alert alert-warn"><p>{blockers[0]}</p></div>
        ) : (
          <details>
            <summary>Delete my account</summary>
            <SimpleForm endpoint="/api/account" method="DELETE" fields={deleteFields} submit="Permanently delete my account" pendingText="Deleting…" buttonClass="btn" />
          </details>
        )}
      </section>
    </>
  );
}
