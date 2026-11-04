import { expect, test, type APIRequest, type APIRequestContext } from "@playwright/test";
import { asUser, PASSWORD, USERS } from "./helpers";

/** Back office: server-side role checks on every page and endpoint, plus the main admin workflows. */

const PAGES = ["/admin", "/admin/users", "/admin/listings", "/admin/orders", "/admin/categories", "/admin/audit", "/admin/moderation"];
const FAKE = "11111111-1111-4111-8111-111111111111";

async function apiAs(request: APIRequest, baseURL: string, email: string) {
  const ctx = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } });
  expect((await ctx.post("/api/auth/signin", { data: { email, password: PASSWORD } })).ok()).toBeTruthy();
  return ctx;
}

const userId = async (ctx: APIRequestContext, email: string) =>
  ((await (await ctx.get(`/api/admin/users?q=${encodeURIComponent(email)}`)).json()).rows as { id: string; email: string }[]).find((u) => u.email === email)!.id;

test.describe("back office permissions", () => {
  test("signed-out visitors are sent to sign-in and get 401 from the API", async ({ page, request, baseURL }) => {
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/signin\?next=%2Fadmin%2Fusers/);
    for (const path of ["/api/admin/overview", "/api/admin/users", "/api/admin/audit"]) {
      expect((await request.get(path)).status(), path).toBe(401);
    }
    expect((await request.patch(`/api/admin/users/${FAKE}`, { data: { suspended: true, note: "nope" }, headers: { origin: baseURL! } })).status()).toBe(401);
  });

  test("a regular member can't reach any admin page or endpoint", async ({ browser, playwright, baseURL }) => {
    const { context, page } = await asUser(browser, USERS.buyer);
    await expect(page.getByRole("link", { name: "Back office" })).toHaveCount(0);
    for (const path of PAGES) {
      await page.goto(path);
      // Admin pages 404 for members (moderation keeps its original redirect home); no admin heading ever renders.
      await expect(page.getByRole("heading", { level: 1, name: /Overview|Users|Listings|Orders|Categories|Audit log|Moderation queue/ }), path).toHaveCount(0);
    }
    await context.close();

    const buyer = await apiAs(playwright.request, baseURL!, USERS.buyer);
    const calls: [string, () => Promise<{ status(): number }>][] = [
      ["GET overview", () => buyer.get("/api/admin/overview")],
      ["GET users", () => buyer.get("/api/admin/users")],
      ["GET user", () => buyer.get(`/api/admin/users/${FAKE}`)],
      ["GET listings", () => buyer.get("/api/admin/listings")],
      ["GET orders", () => buyer.get("/api/admin/orders")],
      ["GET audit", () => buyer.get("/api/admin/audit")],
      ["GET categories", () => buyer.get("/api/admin/categories")],
      ["PATCH user", () => buyer.patch(`/api/admin/users/${FAKE}`, { data: { role: "admin", note: "self-promote" } })],
      ["DELETE sessions", () => buyer.delete(`/api/admin/users/${FAKE}/sessions`, { data: { note: "nope" } })],
      ["PATCH listing", () => buyer.patch(`/api/admin/listings/${FAKE}`, { data: { featured: true, note: "nope" } })],
      ["POST category", () => buyer.post("/api/admin/categories", { data: { id: "hax", name: "Hax", blurb: "", sort: 1 } })],
      ["DELETE category", () => buyer.delete("/api/admin/categories/books")],
      ["POST report action", () => buyer.post(`/api/admin/reports/${FAKE}`, { data: { action: "dismiss", note: "nope" } })],
      ["POST dispute action", () => buyer.post(`/api/admin/disputes/${FAKE}`, { data: { outcome: "release", note: "nope" } })],
    ];
    for (const [label, call] of calls) expect((await call()).status(), label).toBe(403);
    await buyer.dispose();
  });

  test("moderators get read access and member suspension, but not admin-only actions", async ({ browser, playwright, baseURL }) => {
    const mod = await apiAs(playwright.request, baseURL!, USERS.moderator);
    expect((await mod.get("/api/admin/overview")).ok()).toBeTruthy();
    const carlos = await userId(mod, USERS.carlos);
    const admin = await userId(mod, USERS.admin);

    expect((await mod.patch(`/api/admin/users/${carlos}`, { data: { role: "moderator", note: "promote" } })).status()).toBe(403);
    expect((await mod.patch(`/api/admin/users/${admin}`, { data: { suspended: true, note: "coup" } })).status()).toBe(403);
    expect((await mod.post("/api/admin/categories", { data: { id: "nope", name: "Nope", blurb: "", sort: 1 } })).status()).toBe(403);
    const listing = (await (await mod.get("/api/admin/listings?q=aeron")).json()).rows[0];
    expect((await mod.patch(`/api/admin/listings/${listing.id}`, { data: { featured: !listing.featured, note: "feature" } })).status()).toBe(403);

    // Disabling a member signs them out everywhere and blocks sign-in until re-enabled.
    const member = await apiAs(playwright.request, baseURL!, USERS.carlos);
    expect((await mod.patch(`/api/admin/users/${carlos}`, { data: { suspended: true, note: "Spam wave investigation" } })).ok()).toBeTruthy();
    expect((await member.get("/api/admin/overview")).status()).toBe(401);
    expect((await member.post("/api/auth/signin", { data: { email: USERS.carlos, password: PASSWORD } })).status()).toBe(403);
    expect((await mod.patch(`/api/admin/users/${carlos}`, { data: { suspended: false, note: "Cleared" } })).ok()).toBeTruthy();
    expect((await member.post("/api/auth/signin", { data: { email: USERS.carlos, password: PASSWORD } })).ok()).toBeTruthy();
    await member.dispose();
    await mod.dispose();

    // The UI hides the categories page from moderators; the server 404s it too.
    const { context, page } = await asUser(browser, USERS.moderator);
    await page.goto("/admin");
    await expect(page.getByRole("navigation", { name: "Back office" }).getByRole("link", { name: "Categories" })).toHaveCount(0);
    const res = await page.goto("/admin/categories");
    expect(res?.status()).toBe(404);
    await context.close();
  });
});

test.describe("back office workflows", () => {
  test("admin manages roles, can't lock themselves out, and every change is audited", async ({ playwright, baseURL }) => {
    const admin = await apiAs(playwright.request, baseURL!, USERS.admin);
    const self = await userId(admin, USERS.admin);
    const ben = await userId(admin, USERS.ben);

    expect((await admin.patch(`/api/admin/users/${self}`, { data: { role: "user", note: "oops" } })).status()).toBe(403);
    expect((await admin.patch(`/api/admin/users/${self}`, { data: { suspended: true, note: "oops" } })).status()).toBe(403);
    expect((await admin.patch(`/api/admin/users/${ben}`, { data: { note: "nothing" } })).status()).toBe(400);
    expect((await admin.patch(`/api/admin/users/${ben}`, { data: { role: "superuser", note: "x" } })).status()).toBe(400);

    expect((await admin.patch(`/api/admin/users/${ben}`, { data: { role: "moderator", note: "Joining T&S" } })).ok()).toBeTruthy();
    const benCtx = await apiAs(playwright.request, baseURL!, USERS.ben);
    expect((await benCtx.get("/api/admin/overview")).ok()).toBeTruthy();
    expect((await admin.patch(`/api/admin/users/${ben}`, { data: { role: "user", note: "Back to selling" } })).ok()).toBeTruthy();
    expect((await benCtx.get("/api/admin/overview")).status()).toBe(403);
    await benCtx.dispose();

    const audit = (await (await admin.get(`/api/admin/audit?q=${ben}`)).json()).rows as { action: string; details: { from?: string; to?: string } }[];
    expect(audit.filter((a) => a.action === "change_role").map((a) => a.details.to)).toEqual(["user", "moderator"]);
    await admin.dispose();
  });

  test("admin edits a listing and manages categories through the UI", async ({ browser }) => {
    const { context, page } = await asUser(browser, USERS.admin);
    await page.locator(".user-menu summary").click();
    await page.getByRole("link", { name: "Back office" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Overview" })).toBeVisible();
    await expect(page.getByText("Live listings by category")).toBeVisible();

    // Search + sort + open a listing, feature it, then undo.
    // (The header account menu stays open after client-side navigation, so load the page directly.)
    await page.goto("/admin/listings");
    await page.getByRole("searchbox", { name: "Search title, brand or seller" }).fill("tulip");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText("1 listing match.")).toBeVisible();
    await page.getByRole("link", { name: /Price/ }).click();
    await expect(page.getByRole("columnheader", { name: /Price/ })).toHaveAttribute("aria-sort", "descending");
    await page.getByRole("table").getByRole("link", { name: /Tulip/ }).click();
    const feature = page.getByRole("checkbox", { name: "Featured on the home page" });
    const wasFeatured = await feature.isChecked();
    await feature.setChecked(!wasFeatured);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Add a short note for the audit log." })).toBeVisible();
    await page.getByLabel("Note for the audit log").fill("Homepage rotation");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Listing saved.")).toBeVisible();
    await feature.setChecked(wasFeatured);
    await page.getByLabel("Note for the audit log").fill("Undo rotation");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Listing saved.")).toBeVisible();

    // Categories: create, rename, delete (only empty categories can be deleted).
    await page.goto("/admin/categories");
    const form = page.locator("form", { has: page.getByRole("button", { name: "Create category" }) });
    await form.getByLabel("Slug (used in URLs)").fill("Bad Slug!");
    await form.getByLabel("Name").fill("Vinyl");
    await form.getByRole("button", { name: "Create category" }).click();
    await expect(form.getByText("Use 1–30 lowercase letters, digits or dashes.")).toBeVisible();
    await form.getByLabel("Slug (used in URLs)").fill("vinyl");
    await form.getByRole("button", { name: "Create category" }).click();
    await expect(page.getByText("Created “Vinyl”.")).toBeVisible();
    const vinyl = page.locator("details", { hasText: "/vinyl" });
    await vinyl.locator("summary").click();
    await vinyl.getByLabel("Name").fill("Vinyl & Records");
    await vinyl.getByRole("button", { name: "Save" }).click();
    await expect(page.locator("details summary", { hasText: "Vinyl & Records" })).toBeVisible();
    const books = page.locator("details", { hasText: "/books" });
    await books.locator("summary").click();
    await expect(books.getByRole("button", { name: "Delete" })).toBeDisabled();
    page.once("dialog", (d) => d.accept());
    await page.locator("details", { hasText: "/vinyl" }).getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("details", { hasText: "/vinyl" })).toHaveCount(0);

    // The audit log shows the work, filterable by action.
    await page.goto("/admin/audit?filter=create_category");
    await expect(page.getByRole("cell", { name: "create category" })).toBeVisible();
    await page.goto("/admin/audit?filter=edit_listing");
    await expect(page.getByRole("cell", { name: /Homepage rotation/ })).toBeVisible();
    await context.close();
  });

  test("tables paginate and ignore unknown sort columns", async ({ playwright, baseURL }) => {
    const admin = await apiAs(playwright.request, baseURL!, USERS.admin);
    const p1 = await (await admin.get("/api/admin/listings?sort=price_cents&dir=asc")).json();
    const p2 = await (await admin.get("/api/admin/listings?sort=price_cents&dir=asc&page=2")).json();
    expect(p1.rows).toHaveLength(20);
    expect(p1.total).toBeGreaterThan(20);
    expect(p2.rows.length).toBe(Math.min(20, p1.total - 20));
    expect(p1.rows.at(-1).price_cents).toBeLessThanOrEqual(p2.rows[0].price_cents);
    const evil = await admin.get(`/api/admin/users?sort=${encodeURIComponent("email; DROP TABLE users")}&q=${encodeURIComponent("%' OR 1=1 --")}`);
    expect(evil.ok()).toBeTruthy();
    expect((await evil.json()).total).toBe(0);
    await admin.dispose();
  });
});
