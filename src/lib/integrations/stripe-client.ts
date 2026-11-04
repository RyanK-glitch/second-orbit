import Stripe from "stripe";
import { config } from "../env";

let client: Stripe | null = null;

/** Shared Stripe client (test mode only; live keys are rejected in env.ts). */
export function getStripe(): Stripe {
  const key = config.stripe.secretKey;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_")) {
    throw new Error("Only Stripe test-mode keys (sk_test_…) are supported.");
  }
  client ??= new Stripe(key, { appInfo: { name: "second-orbit-marketplace" }, maxNetworkRetries: 2 });
  return client;
}
