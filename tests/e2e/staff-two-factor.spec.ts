import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";
import { enrollTwoFactor, PASSWORD, USERS } from "./helpers";

/**
 * The main suite runs with STAFF_2FA_OPTIONAL=1, because the shared demo staff accounts sign in
 * dozens of times a minute and a code can't be reused. This spec starts a second server with the
 * requirement on, as it would be in production, and uses a newly promoted moderator.
 */
const PORT = 3101;
const url = `http://127.0.0.1:${PORT}`;
let server: ChildProcess;

test.beforeAll(async () => {
  server = spawn("npx", ["next", "start", "-p", String(PORT), "-H", "127.0.0.1"], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      // Set, not just left out: `next start` would otherwise read 1 from a local .env.
      STAFF_2FA_OPTIONAL: "0",
      DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://marketplace:marketplace@localhost:54320/marketplace_test",
      APP_URL: url,
      FORCE_MOCK_INTEGRATIONS: "1",
      DISABLE_RATE_LIMIT: "1",
      MEDIA_DIR: ".data/media-test",
    },
    stdio: "ignore",
  });
  await expect.poll(() => fetch(`${url}/api/health`).then((r) => r.ok, () => false), { timeout: 30_000 }).toBe(true);
});

test.afterAll(() => {
  server.kill();
});

test("staff can't use the back office until two-factor is on, and can't turn it off", async ({ browser, playwright, baseURL }) => {
  // Create a member and promote them through the main server.
  const email = `new.moderator.${Date.now()}@example.com`;
  const password = "a-strong-test-password";
  const main = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } });
  await main.post("/api/auth/signin", { data: { email: USERS.admin, password: PASSWORD } });
  const signup = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } });
  expect((await signup.post("/api/auth/signup", { data: { email, password, displayName: "Nova Moderator" } })).ok()).toBeTruthy();
  await signup.dispose();
  const { rows } = await (await main.get(`/api/admin/users?q=${encodeURIComponent(email)}`)).json();
  expect((await main.patch(`/api/admin/users/${rows[0].id}`, { data: { role: "moderator", note: "Joining T&S" } })).ok()).toBeTruthy();
  await main.dispose();

  const context = await browser.newContext({ baseURL: url });
  const page = await context.newPage();
  await page.goto("/signin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: /^Messages/ })).toBeVisible();

  // Every page and API refuses, and the page sends them to set it up.
  for (const path of ["/admin", "/admin/users", "/admin/moderation", "/admin/chargebacks"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/account\/settings\?two_factor=required/);
  }
  await expect(page.getByRole("alert").filter({ hasText: "Staff need two-factor sign-in" })).toBeVisible();
  const api = await page.request.get("/api/admin/overview");
  expect(api.status()).toBe(403);
  expect((await api.json()).error).toContain("two-factor");

  const { recovery } = await enrollTwoFactor(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
  expect((await page.request.get("/api/admin/overview")).ok()).toBeTruthy();

  // It can't be switched off again, in the UI or the API.
  await page.goto("/account/settings");
  await expect(page.getByText("Staff accounts must keep this on.")).toBeVisible();
  const off = await page.request.post("/api/account/two-factor", { headers: { origin: url }, data: { op: "disable", code: recovery[0] } });
  expect(off.status()).toBe(403);
  await context.close();
});
