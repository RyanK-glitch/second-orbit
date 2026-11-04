"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "./api";

export function AuthForm({ mode, next }: { mode: "signin" | "signup"; next: string }) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const r = await api<{ twoFactor?: boolean }>(`/api/auth/${mode}`, "POST", Object.fromEntries(fd));
    if (r.ok && r.data?.twoFactor) {
      window.location.assign(`/signin/two-factor?next=${encodeURIComponent(next)}`);
      return;
    }
    if (r.ok) {
      // Full navigation so the server-rendered header picks up the new session.
      window.location.assign(next);
      return;
    }
    setBusy(false);
    setError(r.error);
    setFieldErrors(r.fieldErrors);
    const first = Object.keys(r.fieldErrors)[0];
    if (first) document.getElementById(`auth-${first}`)?.focus();
  }

  const field = (name: string, label: string, type: string, autoComplete: string, hint?: string) => (
    <div className="field">
      <label htmlFor={`auth-${name}`}>{label}</label>
      <input
        className="input"
        id={`auth-${name}`}
        name={name}
        type={type}
        required
        autoComplete={autoComplete}
        aria-invalid={fieldErrors[name] ? true : undefined}
        aria-describedby={`auth-${name}-err${hint ? ` auth-${name}-hint` : ""}`}
      />
      {hint && <p className="hint" id={`auth-${name}-hint`}>{hint}</p>}
      <p className="error" id={`auth-${name}-err`}>{fieldErrors[name]}</p>
    </div>
  );

  return (
    <form onSubmit={submit} noValidate>
      {error && (
        <div className="alert alert-error" role="alert">
          <p>{error}</p>
        </div>
      )}
      {mode === "signup" && field("displayName", "Name shown to other members", "text", "nickname")}
      {field("email", "Email", "email", "email")}
      {field("password", "Password", "password", mode === "signup" ? "new-password" : "current-password", mode === "signup" ? "At least 10 characters." : undefined)}
      {mode === "signin" && <p style={{ margin: "-6px 0 16px" }}><Link href="/forgot-password">Forgot your password?</Link></p>}
      {mode === "signup" && (
        <p className="hint">By creating an account you agree to the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link>.</p>
      )}
      <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={busy}>
        {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"}
      </button>
      <p style={{ marginTop: 16, textAlign: "center" }}>
        {mode === "signup" ? (
          <>Already have an account? <Link href={`/signin?next=${encodeURIComponent(next)}`}>Sign in</Link></>
        ) : (
          <>New here? <Link href={`/signup?next=${encodeURIComponent(next)}`}>Create an account</Link></>
        )}
      </p>
    </form>
  );
}
