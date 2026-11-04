import { NextResponse } from "next/server";
import { handleCallback, stashAppleUser } from "@/lib/auth/oauth/flow";
import { config } from "@/lib/env";
import { route } from "@/lib/http";

type Ctx = { params: Promise<{ provider: string }> };
const str = (v: FormDataEntryValue | string | null) => (typeof v === "string" && v.length <= 4096 ? v : null);

/** Google and Facebook (and Apple, after the hop below) land here with ?code&state or ?error. */
export const GET = route<Ctx>(async (req, { params }) => {
  const { provider } = await params;
  const q = new URL(req.url).searchParams;
  const to = await handleCallback(provider, { code: str(q.get("code")), state: str(q.get("state")), error: str(q.get("error")) });
  return NextResponse.redirect(new URL(to, config.appUrl), 303);
});

/**
 * Apple's response_mode=form_post: a cross-site POST, so no CSRF origin check (Apple is the origin)
 * and no Lax cookies. Save the one-time name payload, then hop to the GET handler with a 303 so
 * the browser sends our state cookie and the normal checks run.
 */
export const POST = route<Ctx>(
  async (req, { params }) => {
    const { provider } = await params;
    if (provider !== "apple") return NextResponse.json({ error: "Not found." }, { status: 404 });
    const form = await req.formData().catch(() => new FormData());
    const state = str(form.get("state"));
    if (state) await stashAppleUser(state, str(form.get("user")));
    const qs = new URLSearchParams();
    for (const key of ["code", "state", "error"] as const) {
      const v = str(form.get(key));
      if (v) qs.set(key, v);
    }
    return NextResponse.redirect(new URL(`/api/auth/oauth/apple/callback?${qs}`, config.appUrl), 303);
  },
  { csrf: false },
);
