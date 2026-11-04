import { NextResponse } from "next/server";
import { OAuthFailure, startOAuth } from "@/lib/auth/oauth/flow";
import { config } from "@/lib/env";
import { route } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Starts social sign-in (or, with intent=link, connecting a provider from Settings).
 * A same-origin form POST, so the origin check stops other sites from starting a link flow for a signed-in member.
 */
export const POST = route<{ params: Promise<{ provider: string }> }>(async (req, { params }) => {
  rateLimit(`oauth:${clientIp(req)}`, 30, 10 * 60_000);
  const { provider } = await params;
  const form = await req.formData().catch(() => new FormData());
  const intent = form.get("intent") === "link" ? "link" : "signin";
  const next = typeof form.get("next") === "string" ? (form.get("next") as string) : null;
  try {
    return NextResponse.redirect(await startOAuth(provider, { intent, next }), 303);
  } catch (e) {
    if (!(e instanceof OAuthFailure)) throw e;
    const back = intent === "link" ? `/account/settings?oauth_error=${e.code}` : `/signin?oauth_error=${e.code}`;
    return NextResponse.redirect(new URL(back, config.appUrl), 303);
  }
});
