import { expect, test } from "@playwright/test";
import { asUser, buyNow, expectNoA11yViolations, shipAndDeliver, USERS } from "./helpers";

test("buy → ship → deliver → confirm (escrow release) → review", async ({ browser }) => {
  const buyer = await asUser(browser, USERS.buyer);
  buyer.page.on("dialog", (d) => d.accept());
  const orderPath = await buyNow(buyer.page, "bauhaus", /Bauhaus: Large-Format Art Book/);

  // The listing is now sold and can't be bought again.
  await buyer.page.goto("/shop?q=bauhaus");
  await expect(buyer.page.getByText("Nothing matches yet")).toBeVisible();

  // Seller buys a label and the mock carrier delivers it.
  const seller = await asUser(browser, USERS.hana);
  await seller.page.goto("/account/sales");
  await seller.page.getByRole("link", { name: /Bauhaus/ }).click();
  await expect(seller.page.getByText("Your payout")).toBeVisible();
  await shipAndDeliver(seller.page, new URL(seller.page.url()).pathname);

  // Buyer can't review until delivered; now the review form is available.
  await buyer.page.goto(orderPath);
  await expect(buyer.page.getByText(/Check the item now/)).toBeVisible();
  await expectNoA11yViolations(buyer.page, "order detail (delivered, tracking timeline)");
  await buyer.page.getByRole("button", { name: /release payment/ }).click();
  await expect(buyer.page.getByText("Completed").first()).toBeVisible();
  await expect(buyer.page.getByText("Escrow released to the seller.")).toBeVisible();

  await buyer.page.getByText("★★★★★", { exact: true }).click();
  await buyer.page.getByLabel("What was it like? (optional)").fill("Still sealed, exactly as described. Thanks Hana!");
  await buyer.page.getByRole("button", { name: "Post review" }).click();
  await expect(buyer.page.getByRole("heading", { name: "Your review" })).toBeVisible();
  await expectNoA11yViolations(buyer.page, "order detail (completed, reviewed)");

  // The review appears on the seller's public profile.
  await buyer.page.goto(`/listings/${(await buyer.page.locator(".order-items a").first().getAttribute("href"))!.split("/").pop()}`);
  await buyer.page.getByRole("link", { name: "Hana Sato" }).click();
  await expect(buyer.page.getByText("Still sealed, exactly as described.")).toBeVisible();

  await buyer.context.close();
  await seller.context.close();
});

test("pickup order: schedule a meetup, collect, confirm", async ({ browser }) => {
  const buyer = await asUser(browser, USERS.buyer);
  buyer.page.on("dialog", (d) => d.accept());
  const orderPath = await buyNow(buyer.page, "poang", /IKEA Poäng/);
  await expect(buyer.page.getByRole("heading", { name: "Pickup", exact: true })).toBeVisible();

  const when = new Date(Date.now() + 2 * 864e5);
  when.setMinutes(0, 0, 0);
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await buyer.page.getByLabel("Date and time").fill(local);
  await buyer.page.getByLabel("Public meeting place").fill("Ballard Library entrance");
  await buyer.page.getByRole("button", { name: "Propose time" }).click();
  await expect(buyer.page.getByText(/You proposed/)).toBeVisible();
  await expectNoA11yViolations(buyer.page, "order detail (pickup scheduling)");

  const seller = await asUser(browser, USERS.sofia);
  await seller.page.goto(orderPath);
  await seller.page.getByRole("button", { name: "Accept this time" }).click();
  await expect(seller.page.getByText(/Confirmed:/)).toBeVisible();

  await buyer.page.reload();
  await buyer.page.getByRole("button", { name: "I've collected the item" }).click();
  await expect(buyer.page.getByText("Delivered: inspection window").first()).toBeVisible();
  await buyer.page.getByRole("button", { name: /release payment/ }).click();
  await expect(buyer.page.getByText("Escrow released to the seller.")).toBeVisible();

  await buyer.context.close();
  await seller.context.close();
});

test("auto-release pays the seller when the inspection window lapses", async ({ request }) => {
  // The cron endpoint requires its bearer secret.
  const denied = await request.post("/api/cron/release-funds");
  expect(denied.status()).toBe(403);
  const ok = await request.post("/api/cron/release-funds", { headers: { authorization: "Bearer e2e-cron-secret" } });
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.release).toHaveProperty("released");
});
