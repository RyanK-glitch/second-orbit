import { expect, test, type Browser, type Page } from "@playwright/test";
import { asUser, PASSWORD, USERS } from "./helpers";

/**
 * Social sign-in through the real start/callback routes, against the local provider simulator
 * (OAUTH_MOCK=1). Covers account creation, verified-email linking, refusals, Apple's relay
 * addresses and first-login-only names, cancellation, state checks and Settings linking.
 */

type Identity = { email: string; name?: string; verified?: boolean; share?: boolean; relay?: boolean; firstConsent?: boolean };

async function consent(page: Page, provider: "Google" | "Apple" | "Facebook", id: Identity) {
  await expect(page.getByRole("heading", { name: `Continue with ${provider}` })).toBeVisible();
  await page.getByLabel("Account email").fill(id.email);
  if (id.name) await page.getByLabel("Name", { exact: true }).fill(id.name);
  await page.getByLabel("Share email with the app").setChecked(id.share ?? true);
  if (provider !== "Facebook") await page.getByLabel("Email is verified").setChecked(id.verified ?? true);
  if (provider === "Apple") {
    await page.getByLabel("Hide my email (private relay)").setChecked(id.relay ?? false);
    await page.getByLabel("First time (Apple sends the name)").setChecked(id.firstConsent ?? true);
  }
  await page.getByRole("button", { name: "Continue", exact: true }).click();
}

async function socialSignIn(page: Page, provider: "Google" | "Apple" | "Facebook", id: Identity, next = "/") {
  await page.goto(`/signin?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: `Continue with ${provider}` }).click();
  await consent(page, provider, id);
}

const signedIn = (page: Page) => expect(page.locator(".site-header").getByRole("link", { name: /^Messages/ })).toBeVisible();
const refused = async (page: Page, message: RegExp) => {
  await expect(page).toHaveURL(/\/signin\?.*oauth_error=/);
  await expect(page.getByRole("alert").filter({ hasText: message })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Messages/ })).toHaveCount(0);
};

async function fresh(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

test.describe("social sign-in", () => {
  test("Google creates a new account and returns to the page you came from", async ({ browser }) => {
    const { context, page } = await fresh(browser);
    await socialSignIn(page, "Google", { email: "new.googler@example.com", name: "Gia Google" }, "/account/saved");
    await expect(page).toHaveURL(/\/account\/saved$/);
    await signedIn(page);
    await page.goto("/account/settings");
    await expect(page.getByText("Signed in as new.googler@example.com.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect Google" })).toBeVisible();
    // A social-only account has no password, and can't remove its only sign-in method.
    await page.getByRole("button", { name: "Disconnect Google" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "only way to sign in" })).toBeVisible();
    const pw = await page.request.post("/api/auth/signin", { data: { email: "new.googler@example.com", password: "!oauth" }, headers: { origin: new URL(page.url()).origin } });
    expect(pw.status()).toBe(401);
    await context.close();

    // Signing in again finds the same account by provider id.
    const again = await fresh(browser);
    await socialSignIn(again.page, "Google", { email: "new.googler@example.com" });
    await signedIn(again.page);
    await again.page.goto("/account/settings");
    await expect(again.page.getByLabel("Display name")).toHaveValue("Gia Google");
    await again.context.close();
  });

  test("a verified Google email links to the existing member and signs out their other sessions", async ({ browser }) => {
    const existing = await asUser(browser, USERS.buyer);
    const { context, page } = await fresh(browser);
    await socialSignIn(page, "Google", { email: USERS.buyer.toUpperCase() });
    await signedIn(page);
    await page.goto("/account/settings");
    await expect(page.getByText(`Signed in as ${USERS.buyer}.`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Disconnect Google" })).toBeVisible();
    // Pre-hijack protection: any session that existed before the link is gone.
    await existing.page.goto("/account/orders");
    await expect(existing.page).toHaveURL(/\/signin/);
    // The password still works.
    expect((await existing.page.request.post("/api/auth/signin", { data: { email: USERS.buyer, password: PASSWORD }, headers: { origin: new URL(page.url()).origin } })).ok()).toBeTruthy();
    await existing.context.close();
    await context.close();
  });

  test("unverified emails, Facebook emails and staff accounts never auto-link", async ({ browser }) => {
    const { context, page } = await fresh(browser);
    await socialSignIn(page, "Google", { email: USERS.maya, verified: false });
    await refused(page, /already exists\. Sign in with your password/);
    await socialSignIn(page, "Facebook", { email: USERS.maya });
    await refused(page, /already exists\. Sign in with your password/);
    await socialSignIn(page, "Google", { email: USERS.admin });
    await refused(page, /Staff accounts can't be linked automatically/);
    await socialSignIn(page, "Google", { email: "nobody.verified@example.com", verified: false });
    await refused(page, /hasn't verified your email/);
    await socialSignIn(page, "Facebook", { email: "phone.only@example.com", share: false });
    await refused(page, /didn't share an email address/);
    // Facebook can still create a brand-new account.
    await socialSignIn(page, "Facebook", { email: "fresh.fb@example.com", name: "Fay Book" });
    await signedIn(page);
    await context.close();
  });

  test("Apple: private relay email, and the name only arrives on first consent", async ({ browser }) => {
    const first = await fresh(browser);
    await socialSignIn(first.page, "Apple", { email: "real.person@example.com", name: "Ada Apple", relay: true, firstConsent: true });
    await signedIn(first.page);
    await first.page.goto("/account/settings");
    await expect(first.page.getByText(/Signed in as .*@privaterelay\.appleid\.com\./)).toBeVisible();
    await expect(first.page.getByText("Private relay email")).toBeVisible();
    await expect(first.page.getByLabel("Display name")).toHaveValue("Ada Apple");
    await first.context.close();

    // Later sign-ins: no name and (here) no email at all; the stable Apple id still finds the account.
    const later = await fresh(browser);
    await socialSignIn(later.page, "Apple", { email: "real.person@example.com", share: false, firstConsent: false });
    await signedIn(later.page);
    await later.page.goto("/account/settings");
    await expect(later.page.getByLabel("Display name")).toHaveValue("Ada Apple");
    await later.context.close();

    // A relay address never matches an existing account, even with the same person behind it.
    const relayNoName = await fresh(browser);
    await socialSignIn(relayNoName.page, "Apple", { email: "someone.else@example.com", relay: true, firstConsent: false });
    await signedIn(relayNoName.page);
    await relayNoName.page.goto("/account/settings");
    await expect(relayNoName.page.getByLabel("Display name")).toHaveValue("Apple member");
    await relayNoName.context.close();
  });

  test("cancelling, tampering with state or replaying a callback fails gracefully", async ({ browser, request, baseURL }) => {
    const { context, page } = await fresh(browser);
    for (const provider of ["Google", "Apple", "Facebook"] as const) {
      await page.goto("/signin?next=%2Fshop");
      await page.getByRole("button", { name: `Continue with ${provider}` }).click();
      await page.getByRole("button", { name: "Cancel" }).click();
      await refused(page, /Sign-in was cancelled/);
      await expect(page).toHaveURL(/next=%2Fshop/);
    }

    // A callback whose state doesn't match this browser's cookie is refused.
    await page.goto("/signin");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    const url = new URL(page.url());
    await page.goto(`/api/auth/oauth/google/callback?code=x&state=${"A".repeat(43)}`);
    await refused(page, /took too long or was opened in another browser/);
    // The genuine state is useless to a different browser (no matching cookie).
    const stolen = await request.get(`/api/auth/oauth/google/callback?code=x&state=${url.searchParams.get("state")}`, { maxRedirects: 0 });
    expect(stolen.status()).toBe(303);
    expect(stolen.headers().location).toContain("oauth_error=expired");

    // Each state works once: completing a flow, then replaying its callback URL, fails.
    await page.goto("/signin");
    await page.getByRole("button", { name: "Continue with Google" }).click();
    await page.getByLabel("Account email").fill("replay.check@example.com");
    const [callback] = await Promise.all([
      page.waitForRequest((r) => r.url().includes("/api/auth/oauth/google/callback")),
      page.getByRole("button", { name: "Continue", exact: true }).click(),
    ]);
    await signedIn(page);
    await page.request.post("/api/auth/signout", { headers: { origin: baseURL! } });
    await page.goto(callback.url());
    await refused(page, /took too long/);

    // Starting a flow from another site is blocked.
    expect((await request.post("/api/auth/oauth/google", { headers: { origin: "https://evil.example" }, form: { intent: "link" } })).status()).toBe(403);
    // Unknown or unconfigured providers just show a message.
    expect((await request.post("/api/auth/oauth/myspace", { headers: { origin: baseURL! }, maxRedirects: 0 })).headers().location).toContain("oauth_error=unavailable");
    await context.close();
  });

  test("disabled accounts can't sign in with a social provider", async ({ browser, playwright, baseURL }) => {
    const { context, page } = await fresh(browser);
    await socialSignIn(page, "Google", { email: "soon.disabled@example.com", name: "Dee Sabled" });
    await signedIn(page);
    const mod = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } });
    await mod.post("/api/auth/signin", { data: { email: USERS.moderator, password: PASSWORD } });
    const { rows } = await (await mod.get("/api/admin/users?q=soon.disabled")).json();
    expect(rows[0].providers).toEqual(["google"]);
    expect((await mod.patch(`/api/admin/users/${rows[0].id}`, { data: { suspended: true, note: "Test suspension" } })).ok()).toBeTruthy();
    await mod.dispose();

    await socialSignIn(page, "Google", { email: "soon.disabled@example.com" });
    await refused(page, /This account is suspended/);
    await context.close();
  });

  test("members connect and disconnect providers from Settings", async ({ browser }) => {
    const { context, page } = await asUser(browser, USERS.priya);
    await page.goto("/account/settings");
    await page.getByRole("button", { name: "Connect Facebook" }).click();
    await consent(page, "Facebook", { email: "priya.on.fb@example.com" });
    await expect(page).toHaveURL(/\/account\/settings\?linked=facebook/);
    await expect(page.getByRole("status").filter({ hasText: "Facebook is now connected." })).toBeVisible();

    // That Facebook identity now signs in as Priya, even though its email differs.
    const other = await fresh(browser);
    await socialSignIn(other.page, "Facebook", { email: "priya.on.fb@example.com" });
    await signedIn(other.page);
    await other.page.goto("/account/settings");
    await expect(other.page.getByText(`Signed in as ${USERS.priya}.`)).toBeVisible();
    await other.context.close();

    // A Facebook identity that belongs to someone else can't be attached.
    const leo = await asUser(browser, USERS.leo);
    await leo.page.goto("/account/settings");
    await leo.page.getByRole("button", { name: "Connect Facebook" }).click();
    await consent(leo.page, "Facebook", { email: "priya.on.fb@example.com" });
    await expect(leo.page.getByRole("alert").filter({ hasText: "already connected to a different member" })).toBeVisible();
    await leo.context.close();

    // Priya has a password, so she can disconnect.
    await page.goto("/account/settings");
    await page.getByRole("button", { name: "Disconnect Facebook" }).click();
    await expect(page.getByRole("button", { name: "Connect Facebook" })).toBeVisible();
    await context.close();
  });
});
