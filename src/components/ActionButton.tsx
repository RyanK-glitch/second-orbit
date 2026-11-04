"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "./api";

/**
 * Posts to an API endpoint. On success, follows `{ redirect }` / `{ url }`
 * from the response (external URLs via full navigation) or refreshes the page.
 */
export function ActionButton({
  endpoint,
  body,
  children,
  className = "btn",
  confirmText,
  method = "POST",
  pendingText = "Working…",
}: {
  endpoint: string;
  body?: unknown;
  children: ReactNode;
  className?: string;
  confirmText?: string;
  method?: string;
  pendingText?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={busy}
        onClick={async () => {
          if (confirmText && !window.confirm(confirmText)) return;
          setBusy(true);
          setError(null);
          const r = await api<{ redirect?: string; url?: string }>(endpoint, method, body ?? {});
          if (!r.ok) {
            setBusy(false);
            setError(r.error);
            return;
          }
          const to = r.data?.redirect ?? r.data?.url;
          if (to) {
            if (/^https?:\/\//.test(to)) window.location.assign(to);
            else router.push(to);
          } else {
            setBusy(false);
            router.refresh();
          }
        }}
      >
        {busy ? pendingText : children}
      </button>
      {error && (
        <p className="error" role="alert" style={{ color: "var(--danger)", fontWeight: 600, margin: "8px 0 0" }}>
          {error}
        </p>
      )}
    </>
  );
}
