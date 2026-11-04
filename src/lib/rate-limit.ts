import { HttpError } from "./http";

/**
 * Fixed-window in-memory rate limiter. Good enough for a single instance;
 * swap for Redis/Upstash when running more than one server.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  if (process.env.DISABLE_RATE_LIMIT === "1") return;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    }
    return;
  }
  b.count += 1;
  if (b.count > limit) {
    throw new HttpError(429, "Too many requests. Please wait a moment and try again.");
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
