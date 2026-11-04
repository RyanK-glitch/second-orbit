"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";

type Setup = { key: string; qr: string };

/** Settings panel: turn on (scan, confirm with a code, save recovery codes) or turn off. */
export function TwoFactorPanel({ enabled, codesLeft, canDisable }: { enabled: boolean; codesLeft: number; canDisable: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function begin() {
    setBusy(true);
    setError(null);
    const r = await api<Setup>("/api/account/two-factor", "POST", { op: "begin" });
    setBusy(false);
    if (r.ok) setSetup(r.data);
    else setError(r.error);
  }

  async function withCode(e: React.FormEvent<HTMLFormElement>, op: "confirm" | "disable") {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code") ?? "");
    setBusy(true);
    setError(null);
    const r = await api<{ recoveryCodes?: string[] }>("/api/account/two-factor", "POST", { op, code });
    setBusy(false);
    if (!r.ok) {
      setError(r.fieldErrors.code ?? r.error);
      return;
    }
    if (op === "confirm") {
      setSetup(null);
      setRecovery(r.data?.recoveryCodes ?? []);
    } else {
      router.refresh();
    }
  }

  const alert = error && <div className="alert alert-error" role="alert"><p>{error}</p></div>;
  const codeForm = (op: "confirm" | "disable", label: string, button: string) => (
    <form onSubmit={(e) => withCode(e, op)} noValidate>
      <div className="field">
        <label htmlFor={`two-factor-${op}`}>{label}</label>
        <input className="input" id={`two-factor-${op}`} name="code" autoComplete="one-time-code" required />
      </div>
      <button className="btn" type="submit" disabled={busy}>{busy ? "Checking…" : button}</button>
    </form>
  );

  if (recovery) {
    return (
      <>
        <div className="alert alert-success" role="status"><p>Two-factor sign-in is on.</p></div>
        <p><strong>Save these recovery codes now.</strong> Each one works once if you lose your phone, and they won&apos;t be shown again.</p>
        <ul className="recovery-codes" aria-label="Recovery codes">{recovery.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
        <button className="btn" type="button" onClick={() => { setRecovery(null); router.refresh(); }}>I&apos;ve saved them</button>
      </>
    );
  }
  if (setup) {
    return (
      <>
        {alert}
        <p>Scan this with an authenticator app, such as 1Password, Google Authenticator or Authy.</p>
        <img className="two-factor-qr" src={setup.qr} alt="QR code for your authenticator app" width={220} height={220} />
        <p className="hint">Can&apos;t scan it? Enter this key instead: <code data-testid="totp-key">{setup.key}</code></p>
        {codeForm("confirm", "6-digit code from the app", "Turn on two-factor sign-in")}
      </>
    );
  }
  if (enabled) {
    return (
      <>
        {alert}
        <p>Two-factor sign-in is <strong>on</strong>. You have {codesLeft} recovery code{codesLeft === 1 ? "" : "s"} left.</p>
        {canDisable
          ? codeForm("disable", "Code from your app, or a recovery code", "Turn off two-factor sign-in")
          : <p className="hint">Staff accounts must keep this on.</p>}
      </>
    );
  }
  return (
    <>
      {alert}
      <p>Add a second step at sign-in, using a code from an app on your phone. A stolen password then isn&apos;t enough to get in.</p>
      <button className="btn" type="button" onClick={begin} disabled={busy}>{busy ? "Starting…" : "Set up two-factor sign-in"}</button>
    </>
  );
}
