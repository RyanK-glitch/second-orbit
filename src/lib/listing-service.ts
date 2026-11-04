import { randomUUID } from "node:crypto";
import { z } from "zod";
import { sql } from "./db";
import { CONDITIONS } from "./catalog";
import { analyzeImage, ImageRejected, renderVariants, type QualityReport } from "./images";
import { analytics, storage } from "./integrations";
import { badRequest, conflict, forbidden, HttpError, notFound } from "./http";
import { cleanLine, cleanText } from "./sanitize";
import { canSell, type SessionUser } from "./auth/session";

export const MAX_IMAGES = 8;

export const listingInput = z
  .object({
    title: z.string().transform((s) => cleanLine(s, 120)).pipe(z.string().min(5, "Use at least 5 characters.")),
    categoryId: z.string().min(1, "Choose a category.").max(40),
    brand: z.string().default("").transform((s) => cleanLine(s, 60)),
    condition: z.enum(CONDITIONS, { message: "Choose a condition grade." }),
    priceCents: z.number().int().min(100, "Price must be at least $1.").max(10_000_000, "Price is too high."),
    originalPriceCents: z.number().int().min(100, "Enter the original price when new.").max(50_000_000),
    originalNote: z.string().default("").transform((s) => cleanLine(s, 120)),
    shippingCents: z.number().int().min(0).max(100_000).default(0),
    pickupOnly: z.boolean().default(false),
    description: z.string().transform((s) => cleanText(s, 4000)).pipe(z.string().min(20, "Write at least 20 characters.")),
    wearNotes: z.string().transform((s) => cleanText(s, 2000)).pipe(z.string().min(3, "Describe any wear, or write “No visible wear”.")),
    specs: z
      .record(z.string(), z.string())
      .default({})
      .transform((r) =>
        Object.fromEntries(
          Object.entries(r)
            .slice(0, 12)
            .map(([k, v]) => [cleanLine(k, 40), cleanLine(v, 120)])
            .filter(([k, v]) => k && v),
        ),
      ),
    images: z
      .array(z.object({ id: z.uuid(), kind: z.enum(["photo", "wear_closeup"]) }))
      .min(1, "Add at least one photo.")
      .max(MAX_IMAGES, `Use at most ${MAX_IMAGES} photos.`)
      .refine((imgs) => imgs.some((i) => i.kind === "wear_closeup"), {
        message: "Add at least one close-up of wear or defects (or of a clean surface for Mint items).",
      }),
  });

export type ListingInput = z.infer<typeof listingInput>;

function assertCanSell(user: SessionUser) {
  if (!canSell(user)) throw forbidden("Verify your ID and set up payouts before listing items.");
}

async function attachImages(tx: typeof sql | any, listingId: string, userId: string, title: string, images: ListingInput["images"]) {
  const ids = images.map((i) => i.id);
  const rows = await tx`
    SELECT id, quality FROM listing_images
    WHERE id = ANY(${ids}) AND owner_id = ${userId} AND (listing_id IS NULL OR listing_id = ${listingId})`;
  if (rows.length !== ids.length) throw badRequest("Some photos couldn't be found. Please upload them again.");
  if (rows.some((r: { quality: QualityReport }) => r.quality && r.quality.ok === false)) {
    throw badRequest("One of the photos failed the quality check. Replace it before publishing.");
  }
  // Detach photos the seller removed during an edit.
  await tx`UPDATE listing_images SET listing_id = NULL WHERE listing_id = ${listingId} AND NOT (id = ANY(${ids}))`;
  let photoN = 0;
  let wearN = 0;
  for (const [position, img] of images.entries()) {
    const alt =
      img.kind === "wear_closeup"
        ? `Close-up of wear on ${title}${++wearN > 1 ? ` (${wearN})` : ""}`
        : `${title}, photo ${++photoN}`;
    await tx`UPDATE listing_images SET listing_id = ${listingId}, kind = ${img.kind}, position = ${position}, alt = ${alt}
             WHERE id = ${img.id}`;
  }
}

export async function createListing(user: SessionUser, input: ListingInput) {
  assertCanSell(user);
  const [cat] = await sql`SELECT id FROM categories WHERE id = ${input.categoryId}`;
  if (!cat) throw badRequest("Unknown category.", { fieldErrors: { categoryId: "Choose a category." } });
  const id = await sql.begin(async (tx) => {
    const [row] = await tx`
      INSERT INTO listings (seller_id, category_id, title, brand, description, wear_notes, condition, price_cents,
                            original_price_cents, original_note, shipping_cents, pickup_only, specs)
      VALUES (${user.id}, ${input.categoryId}, ${input.title}, ${input.brand}, ${input.description}, ${input.wearNotes},
              ${input.condition}, ${input.priceCents}, ${input.originalPriceCents}, ${input.originalNote},
              ${input.pickupOnly ? 0 : input.shippingCents}, ${input.pickupOnly}, ${tx.json(input.specs)})
      RETURNING id`;
    await attachImages(tx, row.id, user.id, input.title, input.images);
    return row.id as string;
  });
  await analytics().track("Listing published", { path: "/sell", props: { category: input.categoryId, condition: input.condition } });
  return id;
}

async function ownedListing(listingId: string, user: SessionUser) {
  const [l] = await sql`SELECT id, seller_id, status FROM listings WHERE id = ${listingId}`;
  if (!l || l.status === "removed") throw notFound("Listing not found.");
  if (l.seller_id !== user.id) throw forbidden("You can only change your own listings.");
  return l;
}

export async function updateListing(user: SessionUser, listingId: string, input: ListingInput) {
  const l = await ownedListing(listingId, user);
  if (l.status !== "active") throw conflict("Listings can't be edited while reserved or after they've sold.");
  await sql.begin(async (tx) => {
    await tx`
      UPDATE listings SET category_id = ${input.categoryId}, title = ${input.title}, brand = ${input.brand},
        description = ${input.description}, wear_notes = ${input.wearNotes}, condition = ${input.condition},
        price_cents = ${input.priceCents}, original_price_cents = ${input.originalPriceCents},
        original_note = ${input.originalNote}, shipping_cents = ${input.pickupOnly ? 0 : input.shippingCents},
        pickup_only = ${input.pickupOnly}, specs = ${tx.json(input.specs)}, updated_at = now()
      WHERE id = ${listingId}`;
    await attachImages(tx, listingId, user.id, input.title, input.images);
  });
}

/** Soft delete so order history keeps working. */
export async function deleteListing(user: SessionUser, listingId: string) {
  const l = await ownedListing(listingId, user);
  if (l.status !== "active") throw conflict("Only listings that are still for sale can be removed.");
  await sql`UPDATE listings SET status = 'removed', removed_reason = 'seller', updated_at = now() WHERE id = ${listingId}`;
}

/** Raw data for the edit form. */
export async function getListingForEdit(user: SessionUser, listingId: string) {
  await ownedListing(listingId, user);
  const [l] = await sql`SELECT * FROM listings WHERE id = ${listingId}`;
  const images = await sql`SELECT id, kind, thumb_key, quality FROM listing_images WHERE listing_id = ${listingId} ORDER BY position`;
  return {
    listing: l,
    images: images.map((i) => ({ id: i.id, kind: i.kind, thumbUrl: storage().publicUrl(i.thumb_key), quality: i.quality as QualityReport })),
  };
}

// ---------------------------------------------------------------- uploads

export async function uploadImage(user: SessionUser, file: File, kind: "photo" | "wear_closeup") {
  assertCanSell(user);
  const [{ count }] = await sql`SELECT count(*)::int AS count FROM listing_images WHERE owner_id = ${user.id} AND listing_id IS NULL`;
  if (count >= 40) throw conflict("Too many unpublished photos. Publish or remove some first.");
  const buf = Buffer.from(await file.arrayBuffer());
  let report: QualityReport;
  try {
    report = await analyzeImage(buf);
  } catch (e) {
    if (e instanceof ImageRejected) throw new HttpError(422, e.message);
    throw e;
  }
  if (!report.ok) {
    // Not stored: the seller fixes the photo first.
    throw new HttpError(422, "This photo didn't pass the quality check.", { report });
  }
  const v = await renderVariants(buf);
  const base = `listings/${user.id}/${randomUUID()}`;
  const s = storage();
  await s.put(`${base}.webp`, v.full, "image/webp");
  await s.put(`${base}-thumb.webp`, v.thumb, "image/webp");
  const [row] = await sql`
    INSERT INTO listing_images (owner_id, kind, storage_key, thumb_key, width, height, quality)
    VALUES (${user.id}, ${kind}, ${`${base}.webp`}, ${`${base}-thumb.webp`}, ${v.width}, ${v.height}, ${sql.json(report)})
    RETURNING id`;
  return { id: row.id as string, kind, url: s.publicUrl(`${base}.webp`), thumbUrl: s.publicUrl(`${base}-thumb.webp`), report };
}

export async function deleteUpload(user: SessionUser, imageId: string) {
  const [img] = await sql`SELECT * FROM listing_images WHERE id = ${imageId} AND owner_id = ${user.id} AND listing_id IS NULL`;
  if (!img) throw notFound("Photo not found.");
  await sql`DELETE FROM listing_images WHERE id = ${imageId}`;
  await Promise.all([storage().delete(img.storage_key), storage().delete(img.thumb_key)]);
}

/** Cron: removes photos uploaded but never published. */
export async function purgeOrphanUploads(olderThanHours = 24) {
  const rows = await sql`
    DELETE FROM listing_images WHERE listing_id IS NULL AND created_at < now() - make_interval(hours => ${olderThanHours})
    RETURNING storage_key, thumb_key`;
  for (const r of rows) await Promise.all([storage().delete(r.storage_key), storage().delete(r.thumb_key)]).catch(() => {});
  return rows.length;
}

export async function setSaved(userId: string, listingId: string, saved: boolean) {
  if (saved) {
    const [l] = await sql`SELECT id FROM listings WHERE id = ${listingId} AND status <> 'removed'`;
    if (!l) throw notFound("Listing not found.");
    await sql`INSERT INTO saved_items (user_id, listing_id) VALUES (${userId}, ${listingId}) ON CONFLICT DO NOTHING`;
  } else {
    await sql`DELETE FROM saved_items WHERE user_id = ${userId} AND listing_id = ${listingId}`;
  }
}
