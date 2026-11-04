import { afterEach, describe, expect, it, vi } from "vitest";
import { templates } from "@/lib/email-templates";
import { integrations, isLocalApp } from "@/lib/env";
import { resendEmail } from "@/lib/integrations/email";
import { missingStaffTwoFactor } from "@/lib/auth/permissions";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  vi.unstubAllGlobals();
});

describe("email templates", () => {
  it("every template renders a subject and a signed-off body with no unfilled values", () => {
    const order = { title: "Blue lamp", orderUrl: "http://x/o/1" };
    const rendered = [
      templates.welcome({ name: "Jo", verifyUrl: "http://x/v" }),
      templates.verifyEmail({ verifyUrl: "http://x/v" }),
      templates.passwordReset({ resetUrl: "http://x/r" }),
      templates.passwordChanged({}),
      templates.twoFactorChanged({ enabled: true }),
      templates.orderPaid(order),
      templates.itemSold({ ...order, payoutCents: 1000 }),
      templates.orderShipped({ ...order, carrier: "USPS", trackingCode: "T1" }),
      templates.orderDelivered({ ...order, windowHours: 48 }),
      templates.inspectionEnding(order),
      templates.disputeOpened(order),
      templates.disputeResolved({ ...order, outcome: "the buyer was refunded" }),
      templates.refundIssued({ ...order, amountCents: 1000 }),
      templates.payoutSent({ ...order, amountCents: 1000 }),
      templates.newMessage({ senderName: "Jo", title: "Blue lamp", conversationUrl: "http://x/m" }),
      templates.chargebackSeller(order),
      templates.chargebackStaff({ amountCents: 1000, reason: "", dueBy: "soon", adminUrl: "http://x/a" }),
      templates.chargebackLost(order),
      templates.contactForm({ name: "Jo", email: "jo@example.com", topic: "Selling", orderId: null, message: "Hello there" }),
    ];
    expect(rendered).toHaveLength(Object.keys(templates).length);
    for (const { subject, body } of rendered) {
      expect(subject.length).toBeGreaterThan(5);
      expect(body).toContain("-- Second Orbit");
      expect(`${subject}${body}`).not.toMatch(/undefined|null|NaN|\[object/);
    }
  });

  it("formats money from cents", () => {
    expect(templates.payoutSent({ title: "x", orderUrl: "u", amountCents: 12345 }).body).toContain("$123.45");
  });
});

describe("Resend adapter", () => {
  const email = { to: "a@example.com", subject: "Hi", text: "Body", replyTo: "b@example.com", idempotencyKey: "row-1" };

  it("sends text with an idempotency key, so a retry can't deliver twice", async () => {
    process.env.RESEND_API_KEY = "re_test";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "em_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(resendEmail.send(email)).resolves.toEqual({ id: "em_1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("row-1");
    expect(JSON.parse(init.body as string)).toMatchObject({ to: ["a@example.com"], text: "Body", reply_to: "b@example.com" });
  });

  it("throws on a provider error, so the outbox retries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));
    await expect(resendEmail.send(email)).rejects.toThrow("Resend responded 500");
  });
});

describe("configuration", () => {
  it("selects the real email adapter only when a key is set", () => {
    delete process.env.RESEND_API_KEY;
    delete process.env.FORCE_MOCK_INTEGRATIONS;
    expect(integrations().email).toBe("mock");
    process.env.RESEND_API_KEY = "re_test";
    expect(integrations().email).toBe("resend");
    process.env.FORCE_MOCK_INTEGRATIONS = "1";
    expect(integrations().email).toBe("mock");
  });

  it("treats only this machine as local", () => {
    for (const url of ["http://localhost:3000", "http://127.0.0.1:3100"]) {
      process.env.APP_URL = url;
      expect(isLocalApp()).toBe(true);
    }
    process.env.APP_URL = "https://second-orbit.example";
    expect(isLocalApp()).toBe(false);
  });
});

describe("staff two-factor rule", () => {
  it("applies to staff without it, and never to members", () => {
    expect(missingStaffTwoFactor({ role: "admin", twoFactorEnabled: false }, true)).toBe(true);
    expect(missingStaffTwoFactor({ role: "moderator", twoFactorEnabled: false }, true)).toBe(true);
    expect(missingStaffTwoFactor({ role: "admin", twoFactorEnabled: true }, true)).toBe(false);
    expect(missingStaffTwoFactor({ role: "user", twoFactorEnabled: false }, true)).toBe(false);
    expect(missingStaffTwoFactor({ role: "admin", twoFactorEnabled: false }, false)).toBe(false);
  });
});
