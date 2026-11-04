"use client";

import { useState } from "react";
import { api } from "./api";

export type FormField = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "textarea" | "select";
  autoComplete?: string;
  hint?: string;
  defaultValue?: string;
  options?: readonly string[];
  required?: boolean;
  inputMode?: "numeric" | "text";
};

/**
 * Validated JSON form with the same error handling as the rest of the site. A `{ redirect }` from
 * the API is a full navigation, so the server-rendered header picks up any session change.
 */
export function SimpleForm({
  endpoint,
  method = "POST",
  fields,
  extra,
  submit,
  pendingText = "Please wait…",
  success,
  buttonClass = "btn btn-primary btn-lg btn-block",
}: {
  endpoint: string;
  method?: string;
  fields: FormField[];
  extra?: Record<string, string>;
  submit: string;
  pendingText?: string;
  success?: string;
  buttonClass?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    // Optional fields left blank are omitted, not sent as "".
    const body = Object.fromEntries(Object.entries({ ...values, ...extra }).filter(([, v]) => v !== ""));
    setBusy(true);
    setError(null);
    setFieldErrors({});
    const r = await api<{ redirect?: string }>(endpoint, method, body);
    if (r.ok && r.data?.redirect) {
      window.location.assign(r.data.redirect);
      return;
    }
    setBusy(false);
    if (r.ok) {
      setDone(true);
      return;
    }
    setError(r.error);
    setFieldErrors(r.fieldErrors);
    const first = Object.keys(r.fieldErrors)[0];
    if (first) document.getElementById(`form-${first}`)?.focus();
  }

  if (done) return <div className="alert alert-success" role="status"><p>{success}</p></div>;

  return (
    <form onSubmit={send} noValidate>
      {error && <div className="alert alert-error" role="alert"><p>{error}</p></div>}
      {fields.map((f) => {
        const props = {
          id: `form-${f.name}`,
          name: f.name,
          required: f.required ?? true,
          defaultValue: f.defaultValue,
          "aria-invalid": fieldErrors[f.name] ? true : undefined,
          "aria-describedby": `form-${f.name}-err${f.hint ? ` form-${f.name}-hint` : ""}`,
        };
        return (
          <div className="field" key={f.name}>
            <label htmlFor={props.id}>{f.label}</label>
            {f.type === "textarea" ? (
              <textarea className="textarea" {...props} />
            ) : f.type === "select" ? (
              <select className="input" {...props}>{f.options?.map((o) => <option key={o}>{o}</option>)}</select>
            ) : (
              <input className="input" type={f.type ?? "text"} autoComplete={f.autoComplete} inputMode={f.inputMode} {...props} />
            )}
            {f.hint && <p className="hint" id={`form-${f.name}-hint`}>{f.hint}</p>}
            <p className="error" id={`form-${f.name}-err`}>{fieldErrors[f.name]}</p>
          </div>
        );
      })}
      <button className={buttonClass} type="submit" disabled={busy}>{busy ? pendingText : submit}</button>
    </form>
  );
}
