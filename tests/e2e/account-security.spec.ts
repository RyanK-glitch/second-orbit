import { expect, test, type Browser, type Page } from "@playwright/test";
import { asUser, enrollTwoFactor, inbox, linkIn, signIn, signUp, totpCode, waitForEmail } from "./helpers";

/** Password reset, email verification and two-factor sign-in, on fresh accounts. */

async function fresh(browser: Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

async function passwordStep(page: Page, email: string, password: string) {
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function enterCode(page: Page, code: string) {
  await page.getByLabel("Authentication code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

const signedIn = (page: Page) => expect(page.getByRole("link", { name: /^Messages/ })).toBeVisible();

test.describe("password reset", () => {
  test("a reset link changes the password, signs out every device and works only once", async ({ browser, request }) => {
    const device = await fresh(browser);
    const { email, password } = await signUp(device.page, "Rae Reset");

    const { context, page } = await fresh(browser);
    await page.goto("/signin");
    await page.getByRole("link", { name: "Forgot your password?" }).click();
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await page.getByLabel("Email").fill(email.toUpperCase());
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByRole("status")).toContainText("If that address has an account");

    const link = linkIn(await waitForEmail(request, email, "passwordReset"));
    await page.goto(link);
    await page.getByLabel("New password").fill("short");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByText("Use at least 10 characters.")).toBeVisible();
    await page.getByLabel("New password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Your password has been changed" })).toBeVisible();

    // No session is created by the reset itself.
    await expect(page.getByRole("link", { name: /^Messages/ })).toHaveCount(0);
    // The device that was signed in is signed out.
    await device.page.goto("/account/orders");
    await expect(device.page).toHaveURL(/\/signin/);

    await passwordStep(page, email, password);
    await expect(page.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
    await passwordStep(page, email, "a-brand-new-password");
    await signedIn(page);
    await waitForEmail(request, email, "passwordChanged");

    // Spent links are refused, on the page and at the API.
    await page.goto(link);
    await page.getByLabel("New password").fill("yet-another-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "expired or was already used" })).toBeVisible();
    await context.close();
    await device.context.close();
  });

  test("the response doesn't reveal whether an account exists, and a newer link cancels the old one", async ({ request, baseURL, browser }) => {
    const headers = { origin: baseURL! };
    const unknown = await request.post("/api/auth/password/forgot", { headers, data: { email: "nobody.here@example.com" } });
    expect(unknown.status()).toBe(200);
    expect(await unknown.json()).toEqual({ ok: true });
    expect(await inbox(request, "nobody.here@example.com")).toEqual([]);

    const { context, page } = await fresh(browser);
    const { email } = await signUp(page, "Tess Token");
    expect(await (await request.post("/api/auth/password/forgot", { headers, data: { email } })).json()).toEqual({ ok: true });
    const first = linkIn(await waitForEmail(request, email, "passwordReset"));
    await request.post("/api/auth/password/forgot", { headers, data: { email } });
    await expect.poll(async () => (await inbox(request, email)).filter((e) => e.template === "passwordReset").length).toBe(2);
    const token = new URLSearchParams(first.split("?")[1]).get("token");
    const stale = await request.post("/api/auth/password/reset", { headers, data: { token, password: "another-long-password" } });
    expect(stale.status()).toBe(400);
    await context.close();
  });
});

test("new members get a welcome email and can confirm their address", async ({ browser, request }) => {
  const { context, page } = await fresh(browser);
  const { email } = await signUp(page, "Vera Verify");
  await page.goto("/account/settings");
  await expect(page.getByText("Please confirm your email")).toBeVisible();

  // Opening the link does nothing by itself, because mail scanners open links too.
  const welcome = await waitForEmail(request, email, "welcome");
  await page.goto(linkIn(welcome));
  await page.goto("/account/settings");
  await expect(page.getByText("Please confirm your email")).toBeVisible();

  await page.getByRole("button", { name: "Send a new link" }).click();
  const link = linkIn(await waitForEmail(request, email, "verifyEmail"));
  await page.goto(linkIn(welcome));
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "expired or was already used" })).toBeVisible();
  await page.goto(link);
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByRole("status").filter({ hasText: "confirmed" })).toBeVisible();
  await page.goto("/account/settings");
  await expect(page.getByText("Please confirm your email")).toHaveCount(0);
  await context.close();
});

test.describe("two-factor sign-in", () => {
  test("a password alone no longer signs in, and codes can't be replayed", async ({ browser, request }) => {
    const member = await fresh(browser);
    const { email, password } = await signUp(member.page, "Toby Totp");
    const other = await fresh(browser);
    await signIn(other.page, email, password);

    const { key, recovery } = await enrollTwoFactor(member.page);
    expect(recovery).toHaveLength(10);
    await expect(member.page.getByText("You have 10 recovery codes left.")).toBeVisible();
    await waitForEmail(request, email, "twoFactorChanged");

    // Sessions opened before 2FA are revoked; the one that turned it on stays.
    await other.page.goto("/account/orders");
    await expect(other.page).toHaveURL(/\/signin/);

    const { context, page } = await fresh(browser);
    await passwordStep(page, email, password);
    await expect(page).toHaveURL(/\/signin\/two-factor/);
    await expect(page.getByRole("link", { name: /^Messages/ })).toHaveCount(0);
    // The challenge cookie opens nothing except this page.
    expect((await page.request.get("/api/account/export")).status()).toBe(401);

    await enterCode(page, "000000");
    await expect(page.getByRole("alert").filter({ hasText: "That code isn't right" })).toBeVisible();
    const code = totpCode(key, 1);
    await enterCode(page, code);
    await signedIn(page);
    await context.close();

    // The same code, moments later, on a fresh sign-in.
    const replay = await fresh(browser);
    await passwordStep(replay.page, email, password);
    await expect(replay.page).toHaveURL(/two-factor/);
    await enterCode(replay.page, code);
    await expect(replay.page.getByRole("alert").filter({ hasText: "That code isn't right" })).toBeVisible();

    // A recovery code works, once, however it's typed.
    await enterCode(replay.page, recovery[0].toLowerCase());
    await signedIn(replay.page);
    await replay.page.goto("/account/settings");
    await expect(replay.page.getByText("You have 9 recovery codes left.")).toBeVisible();
    await replay.context.close();

    const reuse = await fresh(browser);
    await passwordStep(reuse.page, email, password);
    await enterCode(reuse.page, recovery[0]);
    await expect(reuse.page.getByRole("alert").filter({ hasText: "That code isn't right" })).toBeVisible();
    await reuse.context.close();

    // Turning it off takes a code, then a password is enough again.
    await member.page.goto("/account/settings");
    await member.page.getByLabel("Code from your app, or a recovery code").fill("000000");
    await member.page.getByRole("button", { name: "Turn off two-factor sign-in" }).click();
    await expect(member.page.getByRole("alert").filter({ hasText: "That code isn't right" })).toBeVisible();
    await member.page.getByLabel("Code from your app, or a recovery code").fill(recovery[1]);
    await member.page.getByRole("button", { name: "Turn off two-factor sign-in" }).click();
    await expect(member.page.getByRole("button", { name: "Set up two-factor sign-in" })).toBeVisible();
    const after = await fresh(browser);
    await signIn(after.page, email, password);
    await after.context.close();
    await member.context.close();
    await other.context.close();
  });

  test("guessing is cut off after five wrong codes", async ({ browser }) => {
    const member = await fresh(browser);
    const { email, password } = await signUp(member.page, "Gus Guess");
    const { key } = await enrollTwoFactor(member.page);
    await member.context.close();

    const { context, page } = await fresh(browser);
    await passwordStep(page, email, password);
    await expect(page).toHaveURL(/two-factor/);
    for (let i = 0; i < 5; i++) {
      await enterCode(page, "000000");
      await expect(page.getByRole("alert").filter({ hasText: "That code isn't right" })).toBeVisible();
    }
    // Even the right code is refused now: the attempt has to start again from the password.
    await enterCode(page, totpCode(key, 1));
    await expect(page.getByRole("alert").filter({ hasText: "expired" })).toBeVisible();
    await context.close();
  });

  test("a password reset doesn't get around two-factor", async ({ browser, request, baseURL }) => {
    const member = await fresh(browser);
    const { email } = await signUp(member.page, "Riley Reset");
    await enrollTwoFactor(member.page);
    await member.context.close();

    await request.post("/api/auth/password/forgot", { headers: { origin: baseURL! }, data: { email } });
    const { context, page } = await fresh(browser);
    await page.goto(linkIn(await waitForEmail(request, email, "passwordReset")));
    await page.getByLabel("New password").fill("a-brand-new-password");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(page).toHaveURL(/reset=1/);
    await passwordStep(page, email, "a-brand-new-password");
    await expect(page).toHaveURL(/\/signin\/two-factor/);
    await context.close();
  });

  test("social sign-in has to pass two-factor too", async ({ browser }) => {
    const { page, context } = await asUser(browser, "jonas@example.com");
    await page.goto("/account/settings");
    await page.getByRole("button", { name: "Connect Google" }).click();
    await page.getByLabel("Account email").fill("jonas.google@example.com");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page).toHaveURL(/linked=google/);
    const { key, recovery } = await enrollTwoFactor(page);

    const other = await fresh(browser);
    await other.page.goto("/signin?next=%2Faccount%2Fsaved");
    await other.page.getByRole("button", { name: "Continue with Google" }).click();
    await other.page.getByLabel("Account email").fill("jonas.google@example.com");
    await other.page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(other.page).toHaveURL(/\/signin\/two-factor\?next=%2Faccount%2Fsaved/);
    await expect(other.page.getByRole("link", { name: /^Messages/ })).toHaveCount(0);
    await enterCode(other.page, totpCode(key, 1));
    await expect(other.page).toHaveURL(/\/account\/saved$/);
    await other.context.close();

    // Later specs sign in as this seller with just a password, so put the account back.
    await page.goto("/account/settings");
    await page.getByLabel("Code from your app, or a recovery code").fill(recovery[0]);
    await page.getByRole("button", { name: "Turn off two-factor sign-in" }).click();
    await expect(page.getByRole("button", { name: "Set up two-factor sign-in" })).toBeVisible();
    await page.getByRole("button", { name: "Disconnect Google" }).click();
    await expect(page.getByRole("button", { name: "Connect Google" })).toBeVisible();
    await context.close();
  });
});
