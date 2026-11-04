import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { refreshVerification } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Return URL from Stripe Identity (or the mock): re-check status with the provider. */
export default async function VerificationReturn() {
  const user = await requirePageUser("/account/settings");
  const status = await refreshVerification(user.id);
  const msg =
    status === "verified"
      ? { kind: "success", title: "You're verified", text: "Next, set up payouts so you can get paid." }
      : status === "failed"
        ? { kind: "error", title: "Verification didn't go through", text: "Please try again with a clear photo of a valid ID." }
        : { kind: "info", title: "Verification in progress", text: "Stripe is reviewing your documents. This usually takes a minute; refresh to check." };
  return (
    <div className="confirm glass">
      <h1>{msg.title}</h1>
      <div className={`alert alert-${msg.kind}`}><p>{msg.text}</p></div>
      <Link className="btn btn-primary" href="/sell">Continue</Link>
    </div>
  );
}
