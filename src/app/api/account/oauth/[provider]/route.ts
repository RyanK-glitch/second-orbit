import { OAuthFailure, unlinkProvider } from "@/lib/auth/oauth/flow";
import { requireUser } from "@/lib/auth/session";
import { badRequest, notFound, route } from "@/lib/http";

/** Disconnect a social provider from the signed-in member. */
export const DELETE = route<{ params: Promise<{ provider: string }> }>(async (_req, { params }) => {
  const user = await requireUser();
  const { provider } = await params;
  if (!["google", "apple", "facebook"].includes(provider)) throw notFound();
  try {
    await unlinkProvider(user.id, provider as "google" | "apple" | "facebook");
  } catch (e) {
    if (e instanceof OAuthFailure) {
      throw e.message === "last sign-in method"
        ? badRequest("This is your only way to sign in, so it can't be disconnected.")
        : notFound("That provider isn't connected.");
    }
    throw e;
  }
  return { ok: true };
});
