import { config } from "../env";
import { sql } from "../db";
import type { AnalyticsAdapter } from "./types";

/**
 * Plausible: cookieless, aggregate-only analytics. Server-side events go to its
 * documented Events API (Plausible has no official Node SDK). We send a generic
 * user agent and no IP, so server events can't be tied to a visitor.
 */
export const plausibleAnalytics: AnalyticsAdapter = {
  name: "plausible",
  async track(name, input = {}) {
    try {
      await fetch(`${config.plausibleHost}/api/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "second-orbit-server" },
        body: JSON.stringify({
          name,
          domain: config.plausibleDomain,
          url: `${config.appUrl}${input.path ?? "/"}`,
          props: input.props ?? {},
        }),
        signal: AbortSignal.timeout(3000),
      });
    } catch (err) {
      console.warn("[analytics] plausible event failed", (err as Error).message);
    }
  },
};

/** Mock: stores the same aggregate event in Postgres so it can be inspected locally. */
export const mockAnalytics: AnalyticsAdapter = {
  name: "mock",
  async track(name, input = {}) {
    try {
      await sql`INSERT INTO analytics_events (name, path, props) VALUES (${name}, ${input.path ?? ""}, ${sql.json(input.props ?? {})})`;
    } catch (err) {
      console.warn("[analytics] mock event failed", (err as Error).message);
    }
  },
};
