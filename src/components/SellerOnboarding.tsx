import { ActionButton } from "./ActionButton";

/** Checklist shown until the seller has passed ID verification and connected payouts. */
export function SellerOnboarding({ verification, payoutsEnabled }: { verification: string; payoutsEnabled: boolean }) {
  const verified = verification === "verified";
  return (
    <section className="panel glass" aria-labelledby="onboard-title">
      <h2 id="onboard-title">Before you list: two quick steps</h2>
      <p className="hint">They keep the marketplace safe and get you paid. Both happen on Stripe-hosted pages, so your ID and bank details never touch our servers.</p>
      <ol className="checklist" style={{ marginTop: 14 }}>
        <li className="glass">
          <div>
            <strong>1. Verify your identity</strong>
            <div className="hint">Photo ID and a selfie, checked by Stripe Identity.</div>
          </div>
          {verified ? (
            <span className="state ok">Verified ✓</span>
          ) : (
            <div>
              {verification === "failed" && <span className="state todo" style={{ marginRight: 10 }}>Last attempt failed</span>}
              <ActionButton endpoint="/api/account/verification" className="btn btn-primary" pendingText="Opening…">
                {verification === "pending" ? "Continue verification" : "Verify ID"}
              </ActionButton>
            </div>
          )}
        </li>
        <li className="glass">
          <div>
            <strong>2. Set up payouts</strong>
            <div className="hint">Connect a bank account through Stripe so escrow can pay you.</div>
          </div>
          {payoutsEnabled ? (
            <span className="state ok">Payouts on ✓</span>
          ) : verified ? (
            <ActionButton endpoint="/api/account/payouts" className="btn btn-primary" pendingText="Opening…">Set up payouts</ActionButton>
          ) : (
            <span className="state todo">After ID verification</span>
          )}
        </li>
      </ol>
    </section>
  );
}
