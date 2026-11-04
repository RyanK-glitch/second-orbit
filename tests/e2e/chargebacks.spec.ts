import { expect, test, type APIRequestContext, type Browser } from "@playwright/test";
import { asUser, buyNow, shipAndDeliver, USERS, waitForEmail } from "./helpers";

/** Card chargebacks, driven through the same code path the Stripe webhooks use. */

const CRON = { authorization: "Bearer e2e-cron-secret" };

async function raiseChargeback(buyerPage: import("@playwright/test").Page, orderPath: string) {
  await buyerPage.goto(orderPath);
  buyerPage.once("dialog", (d) => d.accept());
  await buyerPage.getByRole("button", { name: "Simulate card chargeback (test)" }).click();
  await expect(buyerPage.getByText("Your bank is reviewing this payment")).toBeVisible();
}

async function decide(browser: Browser, title: RegExp, outcome: "won" | "lost") {
  const staff = await asUser(browser, USERS.moderator);
  await staff.page.goto("/admin/chargebacks");
  const card = staff.page.getByRole("region", { name: title });
  await card.getByRole("button", { name: `Simulate bank decision: ${outcome} (test)` }).click();
  await expect(card.getByText(outcome === "won" ? "Won" : "Lost", { exact: true })).toBeVisible();
  await staff.context.close();
}

const orderId = (path: string) => path.split("/").pop()!;
const post = (ctx: APIRequestContext, path: string, baseURL: string) => ctx.post(path, { headers: { origin: baseURL }, data: {} });

test("a chargeback freezes the payout, and winning it lets the order carry on", async ({ browser, baseURL, request }) => {
  const buyer = await asUser(browser, USERS.buyer);
  const orderPath = await buyNow(buyer.page, "harry potter", /Harry Potter Complete/);
  const seller = await asUser(browser, USERS.sofia);
  await shipAndDeliver(seller.page, orderPath);
  await raiseChargeback(buyer.page, orderPath);

  // Staff and the seller are told, and the order page explains the hold.
  await waitForEmail(request, USERS.admin, "chargebackStaff");
  await waitForEmail(request, USERS.sofia, "chargebackSeller");
  await seller.page.goto(orderPath);
  await expect(seller.page.getByText("Payout is on hold")).toBeVisible();

  // The buttons are gone, and the API refuses anyway.
  await buyer.page.reload();
  await expect(buyer.page.getByRole("button", { name: /release payment/ })).toHaveCount(0);
  const confirm = await post(buyer.page.request, `/api/orders/${orderId(orderPath)}/confirm`, baseURL!);
  expect(confirm.status()).toBe(409);
  expect((await confirm.json()).error).toContain("card chargeback");

  // Staff send the evidence, which the bank accepts only once.
  const staff = await asUser(browser, USERS.moderator);
  await staff.page.goto("/admin/chargebacks");
  const card = staff.page.getByRole("region", { name: /Harry Potter/ });
  await expect(card.getByText("Open: payouts frozen")).toBeVisible();
  staff.page.once("dialog", (d) => d.accept());
  await card.getByRole("button", { name: "Submit evidence" }).click();
  await expect(card.getByText(/^Submitted/)).toBeVisible();
  await expect(card.getByRole("button", { name: "Submit evidence" })).toHaveCount(0);
  await staff.context.close();

  await decide(browser, /Harry Potter/, "won");
  await buyer.page.reload();
  await expect(buyer.page.getByText("Your bank is reviewing this payment")).toHaveCount(0);
  buyer.page.once("dialog", (d) => d.accept());
  await buyer.page.getByRole("button", { name: /release payment/ }).click();
  await expect(buyer.page.getByText("Escrow released to the seller.")).toBeVisible();
  await waitForEmail(request, USERS.sofia, "payoutSent");
  await buyer.context.close();
  await seller.context.close();
});

test("losing a chargeback undoes a completed order and doesn't refund twice", async ({ browser, request }) => {
  const buyer = await asUser(browser, USERS.buyer);
  const orderPath = await buyNow(buyer.page, "dr martens", /Dr\. Martens 1460/);
  const seller = await asUser(browser, USERS.leo);
  await shipAndDeliver(seller.page, orderPath);
  await buyer.page.goto(orderPath);
  buyer.page.once("dialog", (d) => d.accept());
  await buyer.page.getByRole("button", { name: /release payment/ }).click();
  await expect(buyer.page.getByText("Escrow released to the seller.")).toBeVisible();

  await raiseChargeback(buyer.page, orderPath);
  await decide(browser, /Dr\. Martens/, "lost");

  await buyer.page.reload();
  await expect(buyer.page.getByText("Refund issued to the original payment method.")).toBeVisible();
  await waitForEmail(request, USERS.buyer, "chargebackLost");
  await waitForEmail(request, USERS.leo, "chargebackLost");
  // The bank returned the money, so our own refund email must never go out for this order.
  const refunds = await (await request.get(`/api/mock/inbox?to=${encodeURIComponent(USERS.buyer)}`)).json();
  expect(refunds.emails.filter((e: { template: string; subject: string }) => e.template === "refundIssued" && e.subject.includes("Martens"))).toEqual([]);
  await buyer.context.close();
  await seller.context.close();
});

test("the scheduled job doesn't pay out a frozen order, and members can't decide chargebacks", async ({ browser, request, baseURL }) => {
  const buyer = await asUser(browser, USERS.buyer);
  const orderPath = await buyNow(buyer.page, "denim trucker", /Denim Trucker Jacket/);
  const seller = await asUser(browser, USERS.sofia);
  await shipAndDeliver(seller.page, orderPath);
  await raiseChargeback(buyer.page, orderPath);

  const mockDecision = (data: object) => buyer.page.request.post("/api/mock/stripe/chargeback", { headers: { origin: baseURL! }, data });
  expect((await mockDecision({ orderId: orderId(orderPath), status: "won" })).status()).toBe(403);

  const cron = await request.post("/api/cron/release-funds", { headers: CRON });
  expect(cron.ok()).toBeTruthy();
  await buyer.page.reload();
  await expect(buyer.page.getByText("Your bank is reviewing this payment")).toBeVisible();

  // Someone else's order can't be charged back.
  const other = await asUser(browser, USERS.priya);
  const stranger = await other.page.request.post("/api/mock/stripe/chargeback", { headers: { origin: baseURL! }, data: { orderId: orderId(orderPath), status: "needs_response" } });
  expect(stranger.status()).toBe(403);
  // Members can't reach the staff page or send evidence.
  const page = await other.page.goto("/admin/chargebacks");
  expect(page?.status()).toBe(404);
  expect((await post(other.page.request, "/api/admin/chargebacks/11111111-1111-4111-8111-111111111111/evidence", baseURL!)).status()).toBe(403);
  await other.context.close();

  await decide(browser, /Denim Trucker/, "won");
  await buyer.context.close();
  await seller.context.close();
});
