import { NextResponse } from "next/server";
import type { z } from "zod";
import { config } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const unauthorized = (msg = "Please sign in to continue.") => new HttpError(401, msg);
export const forbidden = (msg = "You don't have permission to do that.") => new HttpError(403, msg);
export const notFound = (msg = "Not found.") => new HttpError(404, msg);
export const conflict = (msg: string) => new HttpError(409, msg);

/**
 * Rejects cross-site state-changing requests. Browsers always send Origin on
 * POST/PATCH/DELETE fetches, so a mismatch means the request came from
 * another site using the user's cookies.
 */
export function assertSameOrigin(req: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) throw forbidden("Missing Origin header.");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden("Bad Origin header.");
  }
  const allowed = new Set([host, new URL(config.appUrl).host].filter(Boolean));
  if (!allowed.has(originHost)) throw forbidden("Cross-site request blocked.");
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response | unknown>;

/** Wraps a route handler with origin checks and consistent JSON errors. */
export function route<C = { params: Promise<Record<string, string>> }>(fn: Handler<C>, opts: { csrf?: boolean } = {}) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      if (opts.csrf !== false) assertSameOrigin(req);
      const result = await fn(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      console.error("[api]", err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

/** Parses and validates a JSON body; unknown keys are stripped by zod. */
export async function parseJson<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be JSON.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "_";
      fieldErrors[key] ??= issue.message;
    }
    throw badRequest("Please check the highlighted fields.", { fieldErrors });
  }
  return parsed.data;
}

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export function requireUuid(v: string | undefined, what = "id"): string {
  if (!v || !isUuid(v)) throw notFound(`Unknown ${what}.`);
  return v;
}

/** Only allow same-site relative redirects (prevents open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/") {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
