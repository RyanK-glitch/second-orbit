import { expect, test } from "@playwright/test";
import { openListing } from "./helpers";

test.describe("browse and search", () => {
  test("home shows featured and recently listed items", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Pre-loved, verified, delivered.");
    const featured = page.locator("section", { has: page.getByRole("heading", { name: "Featured finds" }) });
    await expect(featured.locator("article.card")).toHaveCount(8);
    const recent = page.locator("section", { has: page.getByRole("heading", { name: "Recently listed" }) });
    await expect(recent.locator("article.card").first()).toBeVisible();
    // Every card shows a condition grade and an image with alt text.
    await expect(recent.locator(".grade").first()).toBeVisible();
    await expect(recent.locator("img").first()).toHaveAttribute("alt", /.+/);
  });

  test("hero orbit is decorative, pausable and still for reduced motion", async ({ browser }) => {
    const front = (page: import("@playwright/test").Page) => page.locator(".orbit-sat").first().evaluate((el) => (el as HTMLElement).style.getPropertyValue("--x"));
    const moving = await browser.newContext({ reducedMotion: "no-preference" });
    const page = await moving.newPage();
    await page.goto("/");
    // Server-rendered at its starting position, so the first frame is complete before any JS runs.
    await expect(page.locator(".orbit-sat")).toHaveCount(7);
    await expect(page.locator(".orbit-sat").first()).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("opacity", "1");
    const start = await front(page);
    await expect.poll(() => front(page)).not.toBe(start);
    // The pause button stops it.
    await page.getByRole("button", { name: "Pause the orbit animation" }).click();
    await page.mouse.move(0, 0);
    const held = await front(page);
    await page.waitForTimeout(400);
    expect(await front(page)).toBe(held);
    await expect(page.getByRole("button", { name: "Play the orbit animation" })).toBeVisible();
    await moving.close();

    const still = await browser.newContext({ reducedMotion: "reduce" });
    const calm = await still.newPage();
    await calm.goto("/");
    const first = await front(calm);
    await calm.waitForTimeout(600);
    expect(await front(calm)).toBe(first);
    await expect(calm.getByRole("button", { name: /orbit animation/ })).toHaveCount(0);
    await still.close();
  });

  test("category filter, condition filter and price sort", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /Electronics/ }).first().click();
    await expect(page).toHaveURL(/cat=electronics/);
    await expect(page.getByRole("heading", { level: 1, name: "Electronics" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("6 items");

    await page.getByRole("checkbox", { name: "Excellent" }).check();
    await expect(page).toHaveURL(/cond=excellent/);
    await expect(page.getByRole("status")).toHaveText("2 items");
    await expect(page.getByRole("link", { name: "Remove filter Excellent" })).toBeVisible();

    await page.getByRole("link", { name: "Remove filter Excellent" }).click();
    await expect(page).not.toHaveURL(/cond=/);
    await expect(page.getByRole("status")).toHaveText("6 items");
    await page.getByLabel("Sort by").selectOption("price_asc");
    await expect(page).toHaveURL(/sort=price_asc/);
    const prices = await page.locator("article.card .price").allTextContents();
    const nums = prices.map((p) => Number(p.replace(/[^0-9.]/g, "")));
    expect(nums.length).toBe(6);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
  });

  test("on phones the search row scrolls away and the header stays compact", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/shop");
    const header = page.locator(".site-header");
    const search = page.getByRole("search").getByLabel("Search listings");
    await expect(search).toHaveCount(1);
    await expect(search).toBeVisible();
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(66);
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
    expect((await header.boundingBox())!.y).toBe(0);
    await expect(search).not.toBeInViewport();

    // It still works, and the open menu sits directly under the header.
    await page.evaluate(() => scrollTo(0, 0));
    await search.fill("noise cancel");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=noise/);
    await page.getByRole("button", { name: "Open menu" }).click();
    const box = (await header.boundingBox())!;
    // Within 1px: the menu is positioned inside the header's bottom border.
    expect(Math.abs((await page.locator(".main-nav.open").boundingBox())!.y - (box.y + box.height))).toBeLessThanOrEqual(1);
  });

  test("full-text search with prefix matching and empty state", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("search").first().getByLabel("Search listings").fill("noise cancel");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/q=noise/);
    await expect(page.getByRole("link", { name: /Sony WH-1000XM4/ })).toBeVisible();

    await page.goto("/shop?q=zzzznotathing");
    await expect(page.getByText("Nothing matches yet")).toBeVisible();
  });

  test("product page shows grade, wear notes, seller, prices and structured data", async ({ page }) => {
    await openListing(page, "macbook", /MacBook Air M1/);
    await expect(page.getByRole("heading", { name: "Condition: Good" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Wear & defects" })).toBeVisible();
    await expect(page.getByText(/Small dent on the rear-left corner/)).toBeVisible();
    await expect(page.locator(".pdp-price .price")).toHaveText("$529");
    await expect(page.locator(".pdp-price .price-orig")).toContainText("$999");
    await expect(page.getByRole("link", { name: "Leo Okafor" })).toBeVisible();
    await expect(page.getByText("ID verified")).toBeVisible();

    // Gallery: keyboard navigation reaches the wear close-up.
    await page.locator(".gallery-main").focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator(".gallery-caption")).toContainText("Wear close-up");

    // SEO: server-rendered metadata + Product JSON-LD.
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent()) ?? "{}");
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers.price).toBe("529.00");
    expect(ld.offers.itemCondition).toBe("https://schema.org/UsedCondition");
    await expect(page).toHaveTitle(/MacBook Air M1/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/media\/seed\//);
  });

  test("product pages are server-rendered and listed in the sitemap", async ({ request }) => {
    const search = await (await request.get("/api/listings?q=bauhaus")).json();
    const id = search.items[0].id as string;
    const html = await (await request.get(`/listings/${id}`)).text();
    expect(html).toContain("Bauhaus: Large-Format Art Book");
    expect(html).toContain('rel="canonical"');
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain(`/listings/${id}`);
    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /api/");
  });

  test("cart updates totals live", async ({ page }) => {
    await openListing(page, "dutch oven", /Le Creuset/);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await openListing(page, "novel bundle", /Hardcover Novel Bundle/);
    await page.getByRole("button", { name: "Add to cart" }).click();
    await expect(page.getByRole("link", { name: "Cart, 2 items" })).toBeVisible();
    await page.getByRole("link", { name: "Cart, 2 items" }).click();
    const total = page.locator(".summary dd.total");
    // $165 + $30 items, $18 + $4 shipping, protection 3% per seller ($4.95 + $1 minimum).
    await expect(total).toHaveText("$222.95");
    await page.getByRole("button", { name: /Remove.*Novel Bundle/ }).click();
    await expect(total).toHaveText("$187.95");
    await expect(page.getByRole("link", { name: "Cart, 1 item" })).toBeVisible();
  });
});
