import path from "node:path";
import { expect, test } from "@playwright/test";

const fixture = (name: string) => path.resolve("tests/fixtures/generated", name);

test("new seller verifies ID, connects payouts, gets photo feedback and publishes a listing", async ({ page }) => {
  // Sign up
  await page.goto("/signup?next=/sell");
  await page.getByLabel("Name shown to other members").fill("Robin Seller");
  await page.getByLabel("Email").fill(`robin+${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("a-strong-test-password");
  await page.getByRole("button", { name: "Create account" }).click();

  // Onboarding gate: ID verification (Stripe Identity mock) then payouts (Connect mock)
  await expect(page.getByRole("heading", { name: /Before you list/ })).toBeVisible();
  await page.getByRole("button", { name: "Verify ID" }).click();
  await expect(page.getByRole("heading", { name: "Verify your identity" })).toBeVisible();
  await page.getByRole("button", { name: "Simulate successful verification" }).click();
  await expect(page.getByRole("heading", { name: "You're verified" })).toBeVisible();
  await page.getByRole("link", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Set up payouts" }).click();
  await page.getByRole("button", { name: "Complete test onboarding" }).click();
  await expect(page.getByRole("heading", { name: "Payouts are on" })).toBeVisible();
  await page.getByRole("link", { name: "List an item" }).click();

  // The form
  await expect(page.getByLabel("Title")).toBeVisible();
  await page.getByLabel("Title").fill("Kindle Paperwhite (11th gen), 8 GB, black");
  await page.getByLabel("Category").selectOption("electronics");
  await page.getByLabel("Brand or maker").fill("Amazon");
  await page.getByRole("radio", { name: /Excellent/ }).check();
  await page.getByLabel("Original price when new").fill("139.99");
  await page.getByLabel("Your asking price").fill("72");
  await page.getByLabel("Shipping cost to buyer").fill("5");
  await expect(page.locator(".payout")).toContainText("$66.24");
  await page.getByLabel("Description").fill("Used for one year of bedtime reading. Battery still lasts weeks. Factory reset.");
  await page.getByLabel("Wear and defects").fill("Faint scuff on the back\nScreen is perfect");

  // Publishing without photos is blocked with a clear message.
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page.locator("#sell-errors")).toContainText("Add at least one photo");

  // A blurry photo is rejected with actionable feedback and isn't added.
  await page.getByLabel("Add photos").setInputFiles(fixture("blurry.jpg"));
  await expect(page.getByText(/Too blurry/)).toBeVisible();
  await expect(page.locator(".upload-card")).toHaveCount(0);

  // A good photo alone still fails: a wear close-up is required.
  await page.getByLabel("Add photos").setInputFiles(fixture("good-photo.jpg"));
  await expect(page.locator(".upload-card")).toHaveCount(1);
  await expect(page.locator(".upload-card").first()).toContainText("Passed quality check");
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page.locator("#sell-errors")).toContainText(/close-up of wear/);

  await page.getByLabel("Add wear close-up").setInputFiles(fixture("wear-closeup.jpg"));
  await expect(page.locator(".upload-card")).toHaveCount(2);
  await expect(page.getByText("wear close-up added ✓")).toBeVisible();
  await page.getByRole("button", { name: "Publish listing" }).click();

  // Live and searchable
  await expect(page.getByRole("heading", { level: 1, name: /Kindle Paperwhite/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Edit listing" })).toBeVisible();
  await page.goto("/shop?q=kindle paperwhite");
  await expect(page.getByRole("link", { name: /Kindle Paperwhite/ })).toBeVisible();

  // Edit (listings CRUD)
  await page.getByRole("link", { name: /Kindle Paperwhite/ }).click();
  await page.getByRole("link", { name: "Edit listing" }).click();
  await page.getByLabel("Your asking price").fill("65");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".pdp-price .price")).toHaveText("$65");
});
