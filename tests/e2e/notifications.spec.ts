import { expect, test } from "@playwright/test";
import { asUser, buyNow, inbox, shipAndDeliver, USERS, waitForEmail } from "./helpers";

/** Each step of an order emails the right person, once. */
test("an order emails both sides at each step", async ({ browser, request }) => {
  const buyer = await asUser(browser, USERS.buyer);
  const orderPath = await buyNow(buyer.page, "nano puff", /Patagonia Nano Puff/);
  const paid = await waitForEmail(request, USERS.buyer, "orderPaid");
  expect(paid.subject).toContain("Patagonia Nano Puff");
  expect(paid.body).toContain(orderPath);
  const sold = await waitForEmail(request, USERS.maya, "itemSold");
  expect(sold.body).toMatch(/You'll receive \$\d+\.\d\d/);

  const seller = await asUser(browser, USERS.maya);
  await shipAndDeliver(seller.page, orderPath);
  expect((await waitForEmail(request, USERS.buyer, "orderShipped")).body).toContain("Tracking number");
  await waitForEmail(request, USERS.buyer, "orderDelivered");

  await buyer.page.goto(orderPath);
  buyer.page.once("dialog", (d) => d.accept());
  await buyer.page.getByRole("button", { name: /release payment/ }).click();
  await expect(buyer.page.getByText("Escrow released to the seller.")).toBeVisible();
  await waitForEmail(request, USERS.maya, "payoutSent");

  const mine = (await inbox(request, USERS.maya)).filter((e) => e.subject.includes("Patagonia"));
  expect(mine.map((e) => e.template).sort()).toEqual(["itemSold", "payoutSent"]);
  await buyer.context.close();
  await seller.context.close();
});

test("new messages email the recipient once an hour, without the message text", async ({ browser, request, baseURL }) => {
  const buyer = await asUser(browser, USERS.buyer);
  const { items } = await (await request.get("/api/listings?q=switch oled")).json();
  const first = await buyer.page.request.post("/api/conversations", { headers: { origin: baseURL! }, data: { listingId: items[0].id, body: "Is the private secret detail included?" } });
  expect(first.ok()).toBeTruthy();
  const { conversationId } = await first.json();
  const email = await waitForEmail(request, USERS.hana, "newMessage");
  expect(email.body).not.toContain("secret detail");
  const second = await buyer.page.request.post(`/api/conversations/${conversationId}/messages`, { headers: { origin: baseURL! }, data: { body: "One more thing" } });
  expect(second.ok()).toBeTruthy();
  const count = async () => (await inbox(request, USERS.hana)).filter((e) => e.template === "newMessage" && e.subject.includes("Switch")).length;
  await expect.poll(count).toBe(1);
  await buyer.context.close();
});

test("the contact form reaches support and keeps the order reference", async ({ browser, request }) => {
  const { context, page } = await asUser(browser, USERS.buyer);
  await page.goto("/contact?order=11111111-1111-4111-8111-111111111111");
  await expect(page.getByLabel("Email")).toHaveValue(USERS.buyer);
  await page.getByLabel("Topic").selectOption("Order problem");
  await page.getByRole("textbox", { name: "Message" }).fill("short");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Tell us a little more")).toBeVisible();
  await page.getByRole("textbox", { name: "Message" }).fill("My parcel arrived with the box crushed.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("status").filter({ hasText: "got your message" })).toBeVisible();
  const email = await waitForEmail(request, "support@second-orbit.example", "contactForm");
  expect(email.body).toContain("11111111-1111-4111-8111-111111111111");
  expect(email.reply_to).toBe(USERS.buyer);
  await context.close();
});

test("policy pages show the same numbers checkout uses, and are linked from every page", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("contentinfo").getByRole("link", { name: "Fees" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Fees" })).toBeVisible();
  await expect(page.getByText("A marketplace fee of 8% of the item price")).toBeVisible();
  await expect(page.getByText("$111.00 (including $3.00 buyer protection)")).toBeVisible();
  for (const name of ["Terms", "Privacy", "Cookies", "Seller agreement", "Prohibited items", "Help", "Contact", "Buyer protection"]) {
    await page.goto("/");
    await page.getByRole("contentinfo").getByRole("link", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page).not.toHaveURL(/\/$/);
  }
  await page.goto("/signup");
  await expect(page.getByRole("main").getByRole("link", { name: "Terms of Service" })).toBeVisible();
});
