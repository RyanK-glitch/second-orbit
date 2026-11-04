import AxeBuilder from "@axe-core/playwright";
import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { base32Decode, codeForStep, timeStep } from "../../src/lib/auth/totp";

/** axe WCAG 2.1 A/AA scan; fails with a readable list of violations. */
export async function expectNoA11yViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

export const PASSWORD = "demo-password-1";
export const USERS = {
  buyer: "buyer@example.com",
  moderator: "mod@example.com",
  admin: "admin@example.com",
  maya: "maya@example.com", // s1: iPhone, Nano Puff, Le Creuset
  jonas: "jonas@example.com", // s2: headphones, Aeron, Trek bike
  priya: "priya@example.com", // s3: Fujifilm, Coach bag, encyclopedia set
  leo: "leo@example.com", // s4: MacBook, Dr. Martens, novel bundle
  sofia: "sofia@example.com", // s5: Levi's, IKEA Poäng (pickup), Harry Potter
  carlos: "carlos@example.com", // s6
  hana: "hana@example.com", // s7: Switch, sideboard, Bauhaus book
  ben: "ben@example.com", // s8: Air Max, lamp, Breville
};

/** Signs in through the real form (exercises the UI and session cookie). */
export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Only signed-in members get the Messages link in the header.
  await expect(page.getByRole("link", { name: /^Messages/ })).toBeVisible();
}

/** A fresh browser context signed in as `email`. */
export async function asUser(browser: Browser, email: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, email);
  return { context, page };
}

/** Finds a listing through search and opens its page. */
export async function openListing(page: Page, query: string, title: RegExp | string) {
  await page.goto(`/shop?q=${encodeURIComponent(query)}`);
  await page.getByRole("link", { name: title }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  return page.url().split("/listings/")[1];
}

/** Buys a single listing through the (mock) Stripe-hosted checkout. Returns the order URL. */
export async function buyNow(page: Page, query: string, title: RegExp | string) {
  await openListing(page, query, title);
  await page.getByRole("button", { name: "Buy now" }).click();
  await expect(page.getByRole("heading", { name: /^Pay \$/ })).toBeVisible();
  await page.getByRole("button", { name: /Pay .*\(test\)/ }).click();
  await expect(page.getByRole("heading", { name: "Payment received" })).toBeVisible();
  await page.getByRole("link", { name: "Track your order" }).click();
  await expect(page.getByText("Paid: funds held").first()).toBeVisible();
  return new URL(page.url()).pathname;
}

/** Seller ships with a mock label and walks the mock carrier to "delivered". */
export async function shipAndDeliver(page: Page, orderPath: string) {
  await page.goto(orderPath);
  await page.getByRole("button", { name: "Create shipping label" }).click();
  await expect(page.getByText("Tracking", { exact: true })).toBeVisible();
  for (const status of ["In transit", "Out for delivery", "Delivered"]) {
    await page.getByRole("button", { name: "Simulate carrier update (test)" }).click();
    await expect(page.getByRole("definition").filter({ hasText: status })).toBeVisible();
  }
  await expect(page.getByText("Delivered: inspection window").first()).toBeVisible();
}

/** The app's code for a given time step. Replays are refused, so each sign-in needs a later `offset`. */
export const totpCode = (key: string, offset = 0) => codeForStep(base32Decode(key), timeStep() + offset);

export type InboxEmail = { template: string; subject: string; body: string; reply_to: string | null };

export async function inbox(request: APIRequestContext, to: string): Promise<InboxEmail[]> {
  return (await (await request.get(`/api/mock/inbox?to=${encodeURIComponent(to)}`)).json()).emails;
}

/** Emails go out just after the response, so this polls until the template arrives. Returns the newest. */
export async function waitForEmail(request: APIRequestContext, to: string, template: string) {
  await expect.poll(async () => (await inbox(request, to)).map((e) => e.template), { message: `${template} to ${to}` }).toContain(template);
  return (await inbox(request, to)).find((e) => e.template === template)!;
}

/** The first link in an email, as a path on this server. */
export function linkIn(email: InboxEmail) {
  const url = new URL(email.body.match(/https?:\/\/\S+/)![0]);
  return url.pathname + url.search;
}

/** Creates a brand-new member through the real form. */
export async function signUp(page: Page, name: string, password = "a-strong-test-password") {
  const email = `${name.toLowerCase().replace(/\W/g, ".")}.${Date.now()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Name shown to other members").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("link", { name: /^Messages/ })).toBeVisible();
  return { email, password };
}

/** Settings → two-factor. Returns the setup key and recovery codes, using up the current time step. */
export async function enrollTwoFactor(page: Page) {
  await page.goto("/account/settings");
  await page.getByRole("button", { name: "Set up two-factor sign-in" }).click();
  const key = (await page.getByTestId("totp-key").textContent())!;
  await page.getByLabel("6-digit code from the app").fill(totpCode(key));
  await page.getByRole("button", { name: "Turn on two-factor sign-in" }).click();
  const list = page.getByRole("list", { name: "Recovery codes" });
  await expect(list).toBeVisible();
  const recovery = await list.getByRole("listitem").allTextContents();
  await page.getByRole("button", { name: "I've saved them" }).click();
  return { key, recovery };
}
