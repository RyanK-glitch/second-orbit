import { integrations } from "../env";
import { mockAnalytics, plausibleAnalytics } from "./analytics";
import { mockEmail, resendEmail } from "./email";
import { mockIdentity, stripeIdentity } from "./identity";
import { mockPayments } from "./payments/mock";
import { stripePayments } from "./payments/stripe";
import { easypostShipping, mockShipping } from "./shipping";
import { localDiskStorage, s3Storage } from "./storage";
import type { AnalyticsAdapter, EmailAdapter, IdentityAdapter, PaymentsAdapter, ShippingAdapter, StorageAdapter } from "./types";

/** Adapter registry: resolved per call so env changes (and tests) take effect without restarts. */
export const payments = (): PaymentsAdapter => (integrations().payments === "stripe" ? stripePayments : mockPayments);
export const identity = (): IdentityAdapter => (integrations().identity === "stripe-identity" ? stripeIdentity : mockIdentity);
export const shipping = (): ShippingAdapter => (integrations().shipping === "easypost" ? easypostShipping : mockShipping);
export const storage = (): StorageAdapter => (integrations().storage === "s3" ? s3Storage : localDiskStorage);
export const analytics = (): AnalyticsAdapter => (integrations().analytics === "plausible" ? plausibleAnalytics : mockAnalytics);
export const email = (): EmailAdapter => (integrations().email === "resend" ? resendEmail : mockEmail);
