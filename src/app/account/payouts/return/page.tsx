import Link from "next/link";
import { requirePageUser } from "@/lib/auth/page";
import { refreshPayouts } from "@/lib/users";

export const dynamic = "force-dynamic";

/** Return/refresh URL from Stripe Connect onboarding (or the mock). */
export default async function PayoutsReturn() {
  const user = await requirePageUser("/account/settings");
  const enabled = await refreshPayouts(user.id);
  return (
    <div className="confirm glass">
      <h1>{enabled ? "Payouts are on" : "Payout setup isn't finished"}</h1>
      <div className={`alert alert-${enabled ? "success" : "warn"}`}>
        <p>{enabled ? "You're ready to sell. Escrow will pay out to your connected account." : "Stripe needs a few more details. You can continue from Settings."}</p>
      </div>
      <Link className="btn btn-primary" href={enabled ? "/sell" : "/account/settings"}>{enabled ? "List an item" : "Back to settings"}</Link>
    </div>
  );
}
