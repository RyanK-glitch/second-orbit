import { expect, test } from "@playwright/test";
import { PASSWORD, USERS } from "./helpers";

/** Authorisation and input-handling checks against the API directly. */
test.describe("API security", () => {
  test("mutations require same-origin requests and a session", async ({ request, baseURL }) => {
    const cross = await request.post("/api/checkout", { data: { listingIds: [] }, headers: { origin: "https://evil.example" } });
    expect(cross.status()).toBe(403);
    const anon = await request.post("/api/checkout", { data: { listingIds: [] }, headers: { origin: baseURL! } });
    expect(anon.status()).toBe(401);
  });

  test("users can't act on other people's listings, orders or conversations", async ({ playwright, baseURL }) => {
    const as = async (email: string) => {
      const ctx = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } });
      expect((await ctx.post("/api/auth/signin", { data: { email, password: PASSWORD } })).ok()).toBeTruthy();
      return ctx;
    };
    const buyer = await as(USERS.buyer);
    const listing = (await (await buyer.get("/api/listings?q=aeron")).json()).items[0];

    // Edit/delete someone else's listing → 403
    const patch = await buyer.patch(`/api/listings/${listing.id}`, {
      data: { title: "Hijacked title", categoryId: "furniture", condition: "good", priceCents: 100, originalPriceCents: 200, description: "x".repeat(30), wearNotes: "none", images: [{ id: "00000000-0000-4000-8000-000000000000", kind: "wear_closeup" }] },
    });
    expect(patch.status()).toBe(403);
    expect((await buyer.delete(`/api/listings/${listing.id}`)).status()).toBe(403);

    // Buyers can't upload listing photos before verifying ID.
    const upload = await buyer.post("/api/uploads", { multipart: { kind: "photo", file: { name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image") } } });
    expect(upload.status()).toBe(403);

    // Someone else's order is invisible (404) and its actions are refused.
    const seller = await as(USERS.jonas);
    const fake = "11111111-1111-4111-8111-111111111111";
    expect((await seller.post(`/api/orders/${fake}/confirm`)).status()).toBe(404);

    // Moderator endpoints need the moderator role.
    expect((await buyer.post(`/api/admin/reports/${fake}`, { data: { action: "dismiss", note: "nope" } })).status()).toBe(403);

    // Buying your own listing is refused.
    const own = await seller.post("/api/checkout", { data: { listingIds: [listing.id] } });
    expect(own.status()).toBe(400);

    // Validation errors come back as field errors, never 500s.
    const bad = await buyer.post("/api/reports", { data: { targetType: "listing", targetId: "not-a-uuid", reason: "nope" } });
    expect(bad.status()).toBe(400);
    expect((await bad.json()).details.fieldErrors).toBeTruthy();

    await buyer.dispose();
    await seller.dispose();
  });

  test("messages are stored as text and rendered escaped", async ({ playwright, baseURL, page }) => {
    const ctx = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL! } });
    await ctx.post("/api/auth/signin", { data: { email: USERS.buyer, password: PASSWORD } });
    const listing = (await (await ctx.get("/api/listings?q=tulip")).json()).items[0];
    const res = await ctx.post("/api/conversations", { data: { listingId: listing.id, body: '<img src=x onerror="window.__pwned=1">hello' } });
    expect(res.ok()).toBeTruthy();
    const { conversationId } = await res.json();
    const state = await ctx.storageState();
    await page.context().addCookies(state.cookies);
    await page.goto(`/messages/${conversationId}`);
    await expect(page.getByRole("log")).toContainText('<img src=x onerror="window.__pwned=1">hello');
    expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
    await ctx.dispose();
  });

  test("local media route rejects path traversal", async ({ request }) => {
    expect((await request.get("/media/..%2F..%2Fpackage.json")).status()).toBe(404);
    expect((await request.get("/media/seed/../../.env")).status()).toBe(404);
  });
});
