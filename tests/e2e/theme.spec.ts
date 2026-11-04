import { expect, test } from "@playwright/test";
import { asUser, USERS } from "./helpers";

/** Dark mode: follows the system, remembers a choice, and never flashes the wrong theme. */
const theme = (page: import("@playwright/test").Page) => page.evaluate(() => document.documentElement.dataset.theme);
const background = (page: import("@playwright/test").Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const toggle = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Dark mode" });

test.describe("system preference", () => {
  test("follows a dark system setting, and updates if it changes", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    expect(await theme(page)).toBe("dark");
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    await page.emulateMedia({ colorScheme: "light" });
    await expect.poll(() => theme(page)).toBe("light");
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  });
});

test("the toggle switches the theme and remembers it across pages and reloads", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const light = await background(page);
  await toggle(page).click();
  expect(await theme(page)).toBe("dark");
  await expect.poll(() => background(page)).not.toBe(light);

  // A chosen theme beats the system setting.
  await page.reload();
  expect(await theme(page)).toBe("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await page.getByRole("banner").getByRole("link", { name: /home/ }).click();
  await page.goto("/shop");
  expect(await theme(page)).toBe("dark");

  await toggle(page).click();
  await page.reload();
  expect(await theme(page)).toBe("light");
});

test("the theme is set before anything paints", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (document.body) {
        (window as unknown as { themeAtBody: string }).themeAtBody = document.documentElement.dataset.theme ?? "unset";
        observer.disconnect();
      }
    }).observe(document, { childList: true, subtree: true });
  });
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/");
  expect(await page.evaluate(() => (window as unknown as { themeAtBody: string }).themeAtBody)).toBe("dark");
  expect(errors.filter((e) => /hydrat|Content Security Policy/i.test(e))).toEqual([]);
});

test("a stored value that isn't a theme falls back to the system setting", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("theme", "purple"));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  expect(await theme(page)).toBe("dark");
});

test("the toggle works by keyboard on a phone-sized screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(toggle(page)).toBeVisible();
  await toggle(page).focus();
  await page.keyboard.press("Enter");
  expect(await theme(page)).toBe("dark");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("pages with a report dialog hydrate cleanly and keep the theme", async ({ browser, request, baseURL }) => {
  // A <dialog> inside a <p> used to break hydration on these pages, which also wiped the theme.
  const { items } = await (await request.get("/api/listings?q=fujifilm")).json();
  const { seller } = await (await request.get(`/api/listings/${items[0].id}`)).json();
  const { context, page } = await asUser(browser, USERS.buyer);
  const { conversationId } = await (await page.request.post("/api/conversations", { headers: { origin: baseURL! }, data: { listingId: items[0].id, body: "Does the lens come with caps?" } })).json();
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of [`/listings/${items[0].id}`, `/sellers/${seller.id}`, `/messages/${conversationId}`]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await theme(page), path).toBe("dark");
  }
  expect(errors).toEqual([]);
  await context.close();
});
