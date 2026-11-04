import { afterEach, describe, expect, it } from "vitest";
import { integrations } from "@/lib/env";

const KEYS = ["FORCE_MOCK_INTEGRATIONS", "STRIPE_SECRET_KEY", "IDENTITY_PROVIDER", "EASYPOST_API_KEY", "S3_BUCKET", "NEXT_PUBLIC_PLAUSIBLE_DOMAIN", "RESEND_API_KEY"];
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const set = (env: Record<string, string>) => {
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
};

describe("adapter selection", () => {
  it("uses mocks for everything when no keys are set", () => {
    set({});
    expect(integrations()).toEqual({ payments: "mock", identity: "mock", shipping: "mock", storage: "local-disk", analytics: "mock", email: "mock" });
  });

  it("switches each integration to its real SDK when its keys are present", () => {
    set({ RESEND_API_KEY: "re_test", STRIPE_SECRET_KEY: "sk_test_123", EASYPOST_API_KEY: "EZTK123", S3_BUCKET: "media", NEXT_PUBLIC_PLAUSIBLE_DOMAIN: "example.com" });
    expect(integrations()).toEqual({ payments: "stripe", identity: "stripe-identity", shipping: "easypost", storage: "s3", analytics: "plausible", email: "resend" });
  });

  it("can keep ID verification mocked while using real Stripe payments", () => {
    set({ STRIPE_SECRET_KEY: "sk_test_123", IDENTITY_PROVIDER: "mock" });
    expect(integrations().payments).toBe("stripe");
    expect(integrations().identity).toBe("mock");
  });

  it("FORCE_MOCK_INTEGRATIONS overrides every key", () => {
    set({ FORCE_MOCK_INTEGRATIONS: "1", STRIPE_SECRET_KEY: "sk_test_123", EASYPOST_API_KEY: "EZTK123", S3_BUCKET: "media" });
    expect(Object.values(integrations()).every((v) => v === "mock" || v === "local-disk")).toBe(true);
  });

  it("refuses live Stripe keys", () => {
    set({ STRIPE_SECRET_KEY: "sk_live_abc" });
    expect(() => integrations()).toThrow(/live Stripe key/);
  });
});
