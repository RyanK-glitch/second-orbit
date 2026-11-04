import { OAUTH_ERRORS, type OAuthErrorCode } from "@/lib/auth/oauth/policy";
import { PROVIDER_LABEL } from "@/lib/auth/oauth/providers";
import { oauthProviders, type OAuthProviderId } from "@/lib/env";

export function ProviderIcon({ id }: { id: OAuthProviderId }) {
  if (id === "google") {
    return (
      <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.3l7.9 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 7l7.2 5.6c4.2-3.9 7.1-9.6 7.1-17.1z" />
        <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.5 0 20.1 0 24s1 7.5 2.6 10.7l7.9-6.1z" />
        <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.2-5.6c-2.1 1.4-4.9 2.3-8.7 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z" />
      </svg>
    );
  }
  if (id === "apple") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="currentColor">
        <path d="M16.4 12.6c0-2.5 2-3.7 2.1-3.8-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9s-2-.9-3.3-.8c-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.6s1.8-.8 3.3-.8 2 .8 3.3.8 2.2-1.3 3-2.5c1-1.4 1.4-2.8 1.4-2.9 0 0-2.7-1-2.7-4.2zM14 5.2c.7-.8 1.2-2 1-3.2-1 0-2.3.7-3 1.5-.7.7-1.2 1.9-1.1 3.1 1.2.1 2.3-.6 3.1-1.4z" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path fill="#fff" d="M13.4 24v-8.4h2.8l.4-3.3h-3.2v-2.1c0-.9.3-1.6 1.6-1.6h1.7V5.7c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.2v3.3H10V24h3.4z" />
    </svg>
  );
}

/** "Continue with …" buttons. Each is a same-origin form POST; only configured providers appear. */
export function SocialSignIn({ next, error }: { next: string; error?: string }) {
  const { enabled } = oauthProviders();
  const message = error && error in OAUTH_ERRORS ? OAUTH_ERRORS[error as OAuthErrorCode] : error ? OAUTH_ERRORS.failed : null;
  if (!enabled.length && !message) return null;
  return (
    <div className="social-signin">
      {message && <div className="alert alert-error" role="alert"><p>{message}</p></div>}
      {enabled.map((id) => (
        <form key={id} action={`/api/auth/oauth/${id}`} method="post">
          <input type="hidden" name="next" value={next} />
          <button type="submit" className={`btn btn-lg btn-block btn-social btn-${id}`}>
            <ProviderIcon id={id} />
            Continue with {PROVIDER_LABEL[id]}
          </button>
        </form>
      ))}
      {enabled.length > 0 && <p className="divider"><span>or use email</span></p>}
    </div>
  );
}
