"use client";

import { useRef, useState } from "react";

/** Builds the simulated authorization code and returns to the callback the way each provider does. */
export function MockOAuthConsent({ provider, state, nonce, callback }: { provider: "google" | "apple" | "facebook"; state: string; nonce: string; callback: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [verified, setVerified] = useState(provider !== "facebook");
  const [shareEmail, setShareEmail] = useState(true);
  const [relay, setRelay] = useState(false);
  const [firstConsent, setFirstConsent] = useState(true);
  const appleForm = useRef<HTMLFormElement>(null);
  const [post, setPost] = useState<Record<string, string> | null>(null);

  function finish(params: Record<string, string>) {
    if (provider === "apple") {
      // Apple returns with a cross-site form POST (response_mode=form_post).
      setPost(params);
      requestAnimationFrame(() => appleForm.current?.submit());
    } else {
      window.location.assign(`${callback}?${new URLSearchParams(params)}`);
    }
  }

  function approve(e: React.FormEvent) {
    e.preventDefault();
    const identityEmail = email.trim().toLowerCase();
    // Stable subject per email (like a real provider's "sub"), independent of what's shared this time.
    const sub = `mock-${provider}-${identityEmail.replace(/[^a-z0-9]/g, "-")}`;
    // Relay addresses are random-looking but stable per identity, like Apple's.
    let h = 5381;
    for (const ch of sub) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
    const reported = !shareEmail ? null : relay ? `${h.toString(36)}@privaterelay.appleid.com` : identityEmail;
    const json = JSON.stringify({ sub, email: reported, emailVerified: verified, privateEmail: relay, name: provider === "apple" ? null : name || null, nonce });
    const code = btoa(String.fromCharCode(...new TextEncoder().encode(json)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const params: Record<string, string> = { code, state };
    if (provider === "apple" && firstConsent && name) {
      const [firstName, ...rest] = name.split(" ");
      params.user = JSON.stringify({ name: { firstName, lastName: rest.join(" ") }, email: reported });
    }
    finish(params);
  }

  const cancel = () => finish({ error: provider === "apple" ? "user_cancelled_authorize" : "access_denied", state });

  return (
    <>
    <form onSubmit={approve}>
      <div className="field">
        <label htmlFor="mock-email">Account email</label>
        <input className="input" id="mock-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="mock-name">Name</label>
        <input className="input" id="mock-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <label className="check"><input type="checkbox" checked={shareEmail} onChange={(e) => setShareEmail(e.target.checked)} /> Share email with the app</label>
      {provider !== "facebook" && (
        <label className="check"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} /> Email is verified</label>
      )}
      {provider === "apple" && (
        <>
          <label className="check"><input type="checkbox" checked={relay} onChange={(e) => setRelay(e.target.checked)} /> Hide my email (private relay)</label>
          <label className="check"><input type="checkbox" checked={firstConsent} onChange={(e) => setFirstConsent(e.target.checked)} /> First time (Apple sends the name)</label>
        </>
      )}
      <div className="form-actions" style={{ marginTop: 18 }}>
        <button type="button" className="btn btn-ghost" onClick={cancel}>Cancel</button>
        <button type="submit" className="btn btn-primary btn-lg">Continue</button>
      </div>
    </form>
    {post && (
      <form ref={appleForm} method="post" action={callback} hidden>
        {Object.entries(post).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      </form>
    )}
    </>
  );
}
