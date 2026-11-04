import { expect, test } from "@playwright/test";
import { asUser, openListing, USERS } from "./helpers";

test("buyer and seller message each other", async ({ browser }) => {
  const buyer = await asUser(browser, USERS.buyer);
  await openListing(buyer.page, "breville", /Breville Barista Express/);
  await buyer.page.getByRole("button", { name: "Message seller" }).click();
  await buyer.page.getByLabel("Your message").fill("Hi Ben, does it come with the original tamper?");
  await buyer.page.getByRole("button", { name: "Send message" }).click();
  await expect(buyer.page.getByRole("log")).toContainText("original tamper");

  const seller = await asUser(browser, USERS.ben);
  await seller.page.getByRole("link", { name: /Messages, 1 unread/ }).click();
  await seller.page.getByRole("link", { name: /Jordan Rivera/ }).click();
  await seller.page.getByLabel("Message Jordan Rivera").fill("Yes! Tamper, milk jug and all four baskets.");
  await seller.page.getByRole("button", { name: "Send" }).click();
  await expect(seller.page.getByRole("log")).toContainText("all four baskets");

  // Buyer's thread picks up the reply (polling).
  await expect(buyer.page.getByRole("log")).toContainText("all four baskets", { timeout: 15_000 });

  // Saved items
  await openListing(buyer.page, "breville", /Breville Barista Express/);
  await buyer.page.getByRole("button", { name: "Save" }).click();
  await expect(buyer.page.getByRole("button", { name: "Saved" })).toBeVisible();
  await buyer.page.goto("/account/saved");
  await expect(buyer.page.getByRole("link", { name: /Breville/ })).toBeVisible();

  await buyer.context.close();
  await seller.context.close();
});

test("reported listing is removed from the moderation queue", async ({ browser }) => {
  const buyer = await asUser(browser, USERS.buyer);
  const id = await openListing(buyer.page, "coach crossbody", /Coach Signature Canvas Crossbody/);
  await buyer.page.getByRole("button", { name: "Report this listing" }).click();
  await buyer.page.getByLabel("Reason").selectOption("counterfeit");
  await buyer.page.getByLabel("Details (optional)").fill("The serial number format doesn't match genuine Coach bags.");
  await buyer.page.getByRole("button", { name: "Send report" }).click();
  await expect(buyer.page.getByText(/Trust & Safety team will review/)).toBeVisible();

  const mod = await asUser(browser, USERS.moderator);
  await mod.page.goto("/admin/moderation");
  const card = mod.page.getByRole("article").filter({ hasText: "Coach Signature Canvas Crossbody" });
  await expect(card).toContainText("Counterfeit or replica");
  await card.getByLabel(/Decision note/).fill("Confirmed replica serial format.");
  await card.getByRole("button", { name: "Remove listing" }).click();
  await expect(mod.page.getByRole("article").filter({ hasText: "Coach Signature Canvas Crossbody" })).toHaveCount(0);

  const res = await buyer.page.goto(`/listings/${id}`);
  expect(res?.status()).toBe(404);
  await buyer.page.goto("/shop?q=coach");
  await expect(buyer.page.getByText("Nothing matches yet")).toBeVisible();

  await buyer.context.close();
  await mod.context.close();
});
