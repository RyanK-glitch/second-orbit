import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { asUser, USERS } from "./helpers";

/** WCAG 2.1 A/AA checks with axe on every key page, signed out and signed in. @a11y */
async function expectNoViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target.join(" ")}`);
  expect(summary, `axe violations on ${label}`).toEqual([]);
}

test.describe("accessibility @a11y", () => {
  test("public pages", async ({ page }) => {
    const id = (await (await page.request.get("/api/listings?q=fujifilm")).json()).items[0].id;
    const seller = (await (await page.request.get(`/api/listings/${id}`)).json()).seller.id;
    for (const [label, path] of [
      ["home", "/"],
      ["catalogue", "/shop"],
      ["search results", "/shop?q=jacket&cond=excellent,good&sort=price_asc"],
      ["empty search", "/shop?q=zzzz"],
      ["product page", `/listings/${id}`],
      ["seller profile", `/sellers/${seller}`],
      ["cart (empty)", "/cart"],
      ["sign in", "/signin"],
      ["sign up", "/signup"],
      ["forgot password", "/forgot-password"],
      ["reset password", "/reset-password?token=example"],
      ["verify email", "/verify-email?token=example"],
      ["help", "/help"],
      ["contact", "/contact"],
      ["terms", "/terms"],
      ["privacy", "/privacy"],
      ["cookies", "/cookies"],
      ["fees", "/fees"],
      ["buyer protection", "/buyer-protection"],
      ["seller agreement", "/seller-agreement"],
      ["prohibited items", "/prohibited-items"],
      ["test inbox", "/mock/inbox"],
      ["404", "/listings/00000000-0000-4000-8000-000000000000"],
    ] as const) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoViolations(page, label);
    }
  });

  test("public pages in dark mode", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("theme", "dark"));
    const id = (await (await page.request.get("/api/listings?q=fujifilm")).json()).items[0].id;
    for (const path of ["/", "/shop", "/shop?q=zzzz", `/listings/${id}`, "/cart", "/signin", "/signup", "/forgot-password", "/help", "/contact", "/fees", "/privacy", "/cookies", "/mock/inbox"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoViolations(page, `${path} (dark)`);
    }
  });

  test("signed-in and back-office pages in dark mode", async ({ browser }) => {
    for (const [user, paths] of [
      [USERS.buyer, ["/account/orders", "/account/settings", "/account/saved", "/messages"]],
      [USERS.hana, ["/account/sales", "/account/listings", "/sell"]],
      [USERS.admin, ["/admin", "/admin/moderation", "/admin/chargebacks", "/admin/users", "/admin/orders", "/admin/audit", "/admin/categories"]],
    ] as const) {
      const { context, page } = await asUser(browser, user);
      await page.addInitScript(() => localStorage.setItem("theme", "dark"));
      for (const path of paths) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        await expectNoViolations(page, `${path} (dark)`);
      }
      await context.close();
    }
  });

  test("dialogs and mobile navigation", async ({ page }) => {
    const id = (await (await page.request.get("/api/listings?q=fujifilm")).json()).items[0].id;
    await page.goto(`/listings/${id}`);
    await page.getByRole("button", { name: "Report this listing" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoViolations(page, "report dialog");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Sell an item" })).toBeVisible();
    await expectNoViolations(page, "mobile nav open");
  });

  test("signed-in buyer, seller and moderator pages", async ({ browser }) => {
    const buyer = await asUser(browser, USERS.buyer);
    for (const [label, path] of [
      ["purchases", "/account/orders"],
      ["saved", "/account/saved"],
      ["settings", "/account/settings"],
      ["messages", "/messages"],
      ["sell onboarding", "/sell"],
    ] as const) {
      await buyer.page.goto(path);
      await expectNoViolations(buyer.page, label);
    }
    // An order page with escrow timeline and actions (created by earlier specs).
    await buyer.page.goto("/account/orders");
    const firstOrder = buyer.page.locator("table a").first();
    if (await firstOrder.count()) {
      await firstOrder.click();
      await expectNoViolations(buyer.page, "order detail");
    }
    await buyer.context.close();

    const seller = await asUser(browser, USERS.maya);
    for (const [label, path] of [["sell form", "/sell"], ["sales", "/account/sales"], ["my listings", "/account/listings"]] as const) {
      await seller.page.goto(path);
      await expectNoViolations(seller.page, label);
    }
    await seller.context.close();

    const mod = await asUser(browser, USERS.moderator);
    await mod.page.goto("/admin/moderation");
    await expectNoViolations(mod.page, "moderation queue");
    await mod.context.close();

    const admin = await asUser(browser, USERS.admin);
    for (const path of ["/admin/chargebacks", "/admin", "/admin/users", "/admin/listings", "/admin/orders", "/admin/categories", "/admin/audit"]) {
      await admin.page.goto(path);
      await expectNoViolations(admin.page, `back office ${path}`);
    }
    await admin.page.goto("/admin/users");
    await admin.page.getByRole("link", { name: "Jordan Rivera" }).click();
    await expectNoViolations(admin.page, "back office user detail");
    await admin.context.close();
  });

  test("keyboard: skip link and visible focus", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });
});
