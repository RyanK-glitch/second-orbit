"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";

/** Disconnect button for one linked provider (connecting is a plain form POST rendered by the server). */
export function DisconnectProvider({ provider, label }: { provider: string; label: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        className="btn"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await api(`/api/account/oauth/${provider}`, "DELETE");
          setBusy(false);
          if (r.ok) router.refresh();
          else setError(r.error);
        }}
      >
        Disconnect {label}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </>
  );
}
