/** Adapter contracts. Each has a real test-mode SDK implementation and a local mock. */

export type Address = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

// ---------------------------------------------------------------- payments
export type CheckoutLine = { name: string; amountCents: number; imageUrl?: string };

export type PaidSession = {
  paymentIntentId: string;
  chargeId: string | null;
  shipTo: Address | null;
};

export interface PaymentsAdapter {
  readonly name: "stripe" | "mock";
  /** Creates a Stripe-hosted checkout page. We never see card details. */
  createCheckoutSession(input: {
    checkoutId: string;
    buyerEmail: string;
    lines: CheckoutLine[];
    shippingRequired: boolean;
    transferGroup: string;
    successUrl: string;
    cancelUrl: string;
    expiresAt: Date;
  }): Promise<{ sessionId: string; url: string }>;
  /** Returns payment details once the session is paid, otherwise null. */
  getPaidSession(sessionId: string): Promise<PaidSession | null>;
  createConnectedAccount(input: { userId: string; email: string }): Promise<{ accountId: string }>;
  createOnboardingLink(input: { accountId: string; returnUrl: string; refreshUrl: string }): Promise<{ url: string }>;
  getAccountStatus(accountId: string): Promise<{ payoutsEnabled: boolean }>;
  /** Releases escrowed funds to the seller's connected account. */
  transfer(input: {
    amountCents: number;
    destination: string;
    transferGroup: string;
    sourceChargeId: string | null;
    idempotencyKey: string;
  }): Promise<{ transferId: string }>;
  refund(input: { paymentIntentId: string; amountCents: number; idempotencyKey: string }): Promise<{ refundId: string }>;
  reverseTransfer(input: { transferId: string; amountCents: number; idempotencyKey: string }): Promise<void>;
  /** Sends our side of a card chargeback to the bank. */
  submitChargebackEvidence(input: { disputeId: string; evidence: ChargebackEvidence }): Promise<void>;
}

/** The subset of Stripe's dispute evidence fields we can fill from order records. */
export type ChargebackEvidence = {
  product_description: string;
  uncategorized_text: string;
  customer_name?: string;
  customer_email_address?: string;
  shipping_carrier?: string;
  shipping_tracking_number?: string;
  shipping_date?: string;
};

// ---------------------------------------------------------------- identity
export type VerificationResult = "pending" | "verified" | "failed";

export interface IdentityAdapter {
  readonly name: "stripe-identity" | "mock";
  createVerification(input: { userId: string; returnUrl: string }): Promise<{ sessionId: string; url: string }>;
  getVerification(sessionId: string): Promise<VerificationResult>;
}

// ---------------------------------------------------------------- shipping
export type ShipmentStatus =
  | "pre_transit"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "return_to_sender"
  | "failure"
  | "unknown";

export type TrackingEvent = { status: ShipmentStatus; message: string; at: string; location?: string };

export type Label = {
  providerShipmentId: string;
  carrier: string;
  service: string;
  trackingCode: string;
  labelUrl: string;
  status: ShipmentStatus;
};

export type Parcel = { weightOz: number; lengthIn: number; widthIn: number; heightIn: number };

export interface ShippingAdapter {
  readonly name: "easypost" | "mock";
  createLabel(input: { orderId: string; from: Address; to: Address; parcel: Parcel }): Promise<Label>;
}

// ---------------------------------------------------------------- storage
export interface StorageAdapter {
  readonly name: "s3" | "local-disk";
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** CDN-ready public URL for a key. Keys are content-unique, so URLs are immutable. */
  publicUrl(key: string): string;
  /** Optional one-time setup (bucket creation for local S3). */
  ensureReady?(): Promise<void>;
}

// ---------------------------------------------------------------- email
export type OutgoingEmail = { to: string; subject: string; text: string; replyTo?: string; idempotencyKey: string };

export interface EmailAdapter {
  readonly name: "resend" | "mock";
  send(email: OutgoingEmail): Promise<{ id: string }>;
}

// ---------------------------------------------------------------- analytics
export interface AnalyticsAdapter {
  readonly name: "plausible" | "mock";
  /** Records an aggregate event. Never pass user ids, emails or other personal data. */
  track(name: string, input?: { path?: string; props?: Record<string, string | number | boolean> }): Promise<void>;
}
