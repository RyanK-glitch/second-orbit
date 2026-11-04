"use client";

export type ApiResult<T = unknown> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
  fieldErrors: Record<string, string>;
  details: Record<string, unknown> | null;
};

/** Small fetch wrapper for our JSON API (same-origin, cookies included). */
export async function api<T = unknown>(path: string, method = "POST", body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers: body instanceof FormData ? undefined : { "Content-Type": "application/json" },
      body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, status: 0, data: null, error: "Network error. Check your connection and try again.", fieldErrors: {}, details: null };
  }
  const json = await res.json().catch(() => ({}));
  return {
    ok: res.ok,
    status: res.status,
    data: res.ok ? (json as T) : null,
    error: res.ok ? null : (json.error ?? "Something went wrong."),
    fieldErrors: json.details?.fieldErrors ?? {},
    details: json.details ?? null,
  };
}
