import { expect, test } from "@playwright/test";
import { asUser, buyNow, expectNoA11yViolations, shipAndDeliver, USERS } from "./helpers";

test("dispute freezes escrow and a moderator refunds the buyer", async ({ browser }) => {
  const buyer = await asUser(browser, USERS.buyer);
  const orderPath = await buyNow(buyer.page, "encyclopedia", /Vintage Hardcover Encyclopedia Set/);

  const seller = await asUser(browser, USERS.priya);
  await shipAndDeliver(seller.page, orderPath);

  // Buyer opens a dispute during the inspection window.
  await buyer.page.goto(orderPath);
  await buyer.page.getByRole("button", { name: "Report a problem" }).click();
  await buyer.page.getByLabel("What went wrong?").selectOption("not_as_described");
  await buyer.page.getByLabel("Describe the problem").fill("Two of the twelve volumes have water damage that wasn't mentioned in the listing.");
  await buyer.page.getByRole("button", { name: "Submit dispute" }).click();
  await expect(buyer.page.getByText("Disputed: funds on hold").first()).toBeVisible();
  await expect(buyer.page.getByRole("button", { name: /release payment/ })).toHaveCount(0);
  await expectNoA11yViolations(buyer.page, "order detail (disputed)");

  // Seller responds.
  await seller.page.goto(orderPath);
  await seller.page.getByLabel("Your response to the buyer's dispute").fill("Sorry about that. Happy for the buyer to get a refund.");
  await seller.page.getByRole("button", { name: "Send response" }).click();
  await expect(seller.page.getByText("Seller response")).toBeVisible();

  // Moderator resolves from the queue with a refund.
  const mod = await asUser(browser, USERS.moderator);
  await mod.page.goto("/admin/moderation");
  const card = mod.page.getByRole("article", { name: /Dispute on Vintage Hardcover Encyclopedia/ });
  await expect(card).toContainText("Not as described");
  await expect(card).toContainText("Happy for the buyer to get a refund");
  await expectNoA11yViolations(mod.page, "moderation queue with open dispute");
  await card.getByLabel(/Decision note/).fill("Condition misrepresented; seller agreed. Full refund.");
  await card.getByRole("button", { name: "Refund buyer" }).click();
  await expect(mod.page.getByRole("article", { name: /Dispute on Vintage Hardcover Encyclopedia/ })).toHaveCount(0);
  await expect(mod.page.getByRole("cell", { name: "dispute refund" })).toBeVisible();

  await buyer.page.reload();
  await expect(buyer.page.getByText("Refunded").first()).toBeVisible();
  await expect(buyer.page.getByText(/Resolved: buyer refunded/)).toBeVisible();
  // Reviews stay locked for refunded orders.
  await expect(buyer.page.getByRole("button", { name: "Post review" })).toHaveCount(0);

  await Promise.all([buyer.context.close(), seller.context.close(), mod.context.close()]);
});
