import { expect, test } from "@playwright/test";
import { asUser, buyNow, enrollTwoFactor, inbox, PASSWORD, signUp, totpCode, USERS } from "./helpers";

/** Data export and account deletion. */

async function openDelete(page: import("@playwright/test").Page) {
  await page.goto("/account/settings");
  await page.getByText("Delete my account", { exact: true }).click();
}

test("the export holds the member's data and none of their secrets", async ({ browser }) => {
  const { context, page } = await asUser(browser, USERS.buyer);
  const res = await page.request.get("/api/account/export");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-disposition"]).toContain("attachment");
  const text = await res.text();
  const data = JSON.parse(text);
  expect(data.profile.email).toBe(USERS.buyer);
  expect(data.purchases.length).toBeGreaterThan(0);
  expect(data.purchases[0].items.length).toBeGreaterThan(0);
  expect(Object.keys(data)).toEqual(expect.arrayContaining(["listings", "sales", "messages", "reviews", "reports", "disputes", "savedItems", "connectedAccounts"]));
  for (const secret of ["password_hash", "scrypt$", "totp_secret", "token_hash", "code_hash"]) expect(text).not.toContain(secret);
  await context.close();
});

test("the export needs a session, and sellers' exports leave out buyers' addresses", async ({ browser, request }) => {
  expect((await request.get("/api/account/export")).status()).toBe(401);
  const { context, page } = await asUser(browser, USERS.hana);
  const { sales } = await (await page.request.get("/api/account/export")).json();
  expect(sales.length).toBeGreaterThan(0);
  expect(sales[0]).not.toHaveProperty("ship_to");
  await context.close();
});

test("deletion is refused while money is held, or with the wrong proof", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const { email, password } = await signUp(page, "Olive Open");
  await buyNow(page, "novel bundle", /Hardcover Novel Bundle/);
  await page.goto("/account/settings");
  await expect(page.getByText("You have 1 order in progress.")).toBeVisible();
  await expect(page.getByText("Delete my account", { exact: true })).toHaveCount(0);
  const del = (data: object) => page.request.delete("/api/account", { headers: { origin: baseURL! }, data });
  expect((await del({ confirmEmail: email, password })).status()).toBe(409);
  expect((await del({ confirmEmail: email, password: "wrong-password" })).status()).toBe(401);
  expect((await del({ confirmEmail: "someone@else.example", password })).status()).toBe(400);
  await context.close();

  const staff = await asUser(browser, USERS.moderator);
  await staff.page.goto("/account/settings");
  await expect(staff.page.getByText("Staff accounts can't be deleted.")).toBeVisible();
  await staff.context.close();
});

test("deleting a seller removes their data and leaves the other side's history intact", async ({ browser, request, baseURL, playwright }) => {
  // Someone has a conversation with the seller first.
  const buyer = await asUser(browser, USERS.buyer);
  const { items } = await (await request.get("/api/listings?q=fender stratocaster")).json();
  const listingId = items[0].id;
  const headers = { origin: baseURL! };
  const { conversationId } = await (await buyer.page.request.post("/api/conversations", { headers, data: { listingId, body: "Is this still available?" } })).json();
  const seller = await asUser(browser, USERS.carlos);
  const sellerId = (await (await request.get(`/api/listings/${listingId}`)).json()).seller.id;
  await seller.page.request.post(`/api/conversations/${conversationId}/messages`, { headers, data: { body: "Yes, call me on 555-0100" } });

  await openDelete(seller.page);
  await seller.page.getByLabel("Your password").fill(PASSWORD);
  await seller.page.getByLabel(`Type ${USERS.carlos} to confirm`).fill(USERS.carlos);
  await seller.page.getByRole("button", { name: "Permanently delete my account" }).click();
  await expect(seller.page.getByRole("heading", { name: "Your account has been deleted" })).toBeVisible();
  await expect(seller.page.getByRole("link", { name: /^Messages/ })).toHaveCount(0);
  await seller.page.goto("/account/settings");
  await expect(seller.page).toHaveURL(/\/signin/);
  await seller.context.close();

  // Public traces are gone.
  expect((await request.get(`/sellers/${sellerId}`)).status()).toBe(404);
  expect((await (await request.get("/api/listings?q=fender stratocaster")).json()).items).toEqual([]);
  expect(await inbox(request, USERS.carlos)).toEqual([]);

  // They can't sign in, and the email is free to use again.
  const anon = await playwright.request.newContext({ baseURL, extraHTTPHeaders: headers });
  expect((await anon.post("/api/auth/signin", { data: { email: USERS.carlos, password: PASSWORD } })).status()).toBe(401);
  expect((await anon.post("/api/auth/signup", { data: { email: USERS.carlos, password: "a-strong-test-password", displayName: "Carlos Again" } })).ok()).toBeTruthy();
  await anon.dispose();

  // The buyer keeps the thread, without the deleted member's words, and can't write to nobody.
  await buyer.page.goto(`/messages/${conversationId}`);
  await expect(buyer.page.getByText("Is this still available?")).toBeVisible();
  await expect(buyer.page.getByText("the sender deleted their account").first()).toBeVisible();
  await expect(buyer.page.getByText("555-0100")).toHaveCount(0);
  await expect(buyer.page.getByText("Deleted member").first()).toBeVisible();
  const reply = await buyer.page.request.post(`/api/conversations/${conversationId}/messages`, { headers, data: { body: "Hello?" } });
  expect(reply.status()).toBe(409);

  // Staff can still see that the account existed, and the deletion is in the audit log.
  const admin = await asUser(browser, USERS.admin);
  const audit = await (await admin.page.request.get(`/api/admin/audit?q=${sellerId}`)).json();
  expect(audit.rows.map((r: { action: string }) => r.action)).toContain("account_deleted");
  await admin.context.close();
  await buyer.context.close();
});

test("two-factor members need a code to delete their account", async ({ browser, baseURL }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const { email, password } = await signUp(page, "Dana Delete");
  const { key } = await enrollTwoFactor(page);
  const headers = { origin: baseURL! };
  const refused = await page.request.delete("/api/account", { headers, data: { confirmEmail: email, password } });
  expect(refused.status()).toBe(401);
  await openDelete(page);
  await page.getByLabel("Your password").fill(password);
  await page.getByLabel("Authentication code").fill(totpCode(key, 1));
  await page.getByLabel(`Type ${email} to confirm`).fill(email);
  await page.getByRole("button", { name: "Permanently delete my account" }).click();
  await expect(page.getByRole("heading", { name: "Your account has been deleted" })).toBeVisible();
  await context.close();
  const again = await browser.newContext();
  const retry = await again.newPage();
  await retry.goto("/signin");
  await retry.getByLabel("Email").fill(email);
  await retry.getByLabel("Password").fill(password);
  await retry.getByRole("button", { name: "Sign in" }).click();
  await expect(retry.getByRole("alert").filter({ hasText: "don't match" })).toBeVisible();
  await again.close();
});

test("social-only members confirm by typing their email", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/signin");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const email = `only.social.${Date.now()}@example.com`;
  await page.getByLabel("Account email").fill(email);
  await page.getByLabel("Name", { exact: true }).fill("Sol Social");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("link", { name: /^Messages/ })).toBeVisible();
  await openDelete(page);
  await expect(page.getByLabel("Your password")).toHaveCount(0);
  await page.getByLabel(`Type ${email} to confirm`).fill(email);
  await page.getByRole("button", { name: "Permanently delete my account" }).click();
  await expect(page.getByRole("heading", { name: "Your account has been deleted" })).toBeVisible();
  await context.close();
  // A later Google sign-in starts a new account rather than reviving the old one.
  const again = await browser.newContext();
  const next = await again.newPage();
  await next.goto("/signin");
  await next.getByRole("button", { name: "Continue with Google" }).click();
  await next.getByLabel("Account email").fill(email);
  await next.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(next.getByRole("link", { name: /^Messages/ })).toBeVisible();
  await again.close();
});
