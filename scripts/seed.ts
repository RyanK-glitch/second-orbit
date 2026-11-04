/**
 * Seeds categories, demo accounts, 24 live listings with rendered photos,
 * and some completed historical orders so sellers have real ratings.
 *
 *   npm run db:seed              → seed (fails if data exists)
 *   npm run db:seed -- --if-empty → no-op when users already exist
 */
import "./_env";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { sql } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/password";
import { renderVariants } from "../src/lib/images";
import { storage } from "../src/lib/integrations";
import { productSvg, type ArtVariant } from "../src/lib/placeholder-art";
import { CATEGORIES, LISTINGS, SELLERS } from "./seed-data";
import { isMain } from "./_main";

export const DEMO_PASSWORD = "demo-password-1";

const SELLER_EMAILS: Record<string, string> = {
  s1: "maya@example.com", s2: "jonas@example.com", s3: "priya@example.com", s4: "leo@example.com",
  s5: "sofia@example.com", s6: "carlos@example.com", s7: "hana@example.com", s8: "ben@example.com",
};

const BIOS: Record<string, string> = {
  s1: "Gadget tinkerer clearing out the drawer of last-gen tech. Everything is tested before I list it.",
  s2: "Remote worker, cyclist and occasional furniture flipper.",
  s3: "Photographer and reader. I pack like it's going through a hurricane.",
  s4: "Vintage boots, good books and solid hardware. Brooklyn pickup available.",
  s5: "Downsizing a two-bedroom into a one-bedroom. Smoke-free, pet-free home.",
  s6: "Musician and weekend woodworker. Happy to answer questions.",
  s7: "Mid-century furniture restorer. Every piece is cleaned and checked.",
  s8: "Coffee nerd and design fan. Fast shipping, careful packing.",
};

const REVIEW_SNIPPETS = [
  [5, "Exactly as described, and the wear notes were spot on. Packed really well."],
  [5, "Fast shipping and a great price. The condition grade was honest."],
  [4, "Item was great. Shipping took a day longer than expected."],
  [5, "Seller answered all my questions quickly. Would buy again."],
  [4, "Good condition. One scuff wasn't in the photos, but it was minor and the seller apologised."],
  [5, "Better than I expected for the price!"],
] as const;

type Credit = { file: string; kind: "photo" | "wear_closeup"; title: string; creator: string; license: string; license_version: string; license_url: string; source_url: string; changes: string };

// Real CC BY product photos (see db/seed-photos/sources.json); line-art renders are the fallback.
const PHOTO_DIR = path.resolve("db/seed-photos");
const CREDITS: Record<string, Credit[]> = existsSync(path.join(PHOTO_DIR, "credits.json"))
  ? JSON.parse(readFileSync(path.join(PHOTO_DIR, "credits.json"), "utf8"))
  : {};

async function renderSeedImage(shape: string, hue: number, variant: ArtVariant) {
  const png = await sharp(Buffer.from(productSvg(shape, hue, variant))).png().toBuffer();
  return renderVariants(png);
}

export async function seed() {
  const s = storage();
  await s.ensureReady?.();
  const hash = await hashPassword(DEMO_PASSWORD);
  const now = Date.now();

  for (const [i, c] of CATEGORIES.entries()) {
    await sql`INSERT INTO categories (id, name, blurb, sort) VALUES (${c.id}, ${c.name}, ${c.blurb}, ${i})
              ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, blurb = EXCLUDED.blurb, sort = EXCLUDED.sort`;
  }

  // ---- accounts
  const sellerIds: Record<string, string> = {};
  for (const [key, seller] of Object.entries(SELLERS)) {
    const [u] = await sql`
      INSERT INTO users (email, password_hash, display_name, location, bio, verification_status, stripe_account_id, payouts_enabled, created_at)
      VALUES (${SELLER_EMAILS[key]}, ${hash}, ${seller.name}, ${seller.location}, ${BIOS[key] ?? ""}, 'verified',
              ${`mock_acct_seed_${key}`}, true, ${new Date(`${seller.since}-03-15T12:00:00Z`)})
      RETURNING id`;
    sellerIds[key] = u.id;
  }
  const [buyer] = await sql`
    INSERT INTO users (email, password_hash, display_name, location) VALUES ('buyer@example.com', ${hash}, 'Jordan Rivera', 'Oakland, CA')
    RETURNING id`;
  await sql`
    INSERT INTO users (email, password_hash, display_name, location, role, verification_status)
    VALUES ('mod@example.com', ${hash}, 'Morgan (Trust & Safety)', 'Remote', 'moderator', 'verified')`;
  await sql`
    INSERT INTO users (email, password_hash, display_name, location, role, verification_status)
    VALUES ('admin@example.com', ${hash}, 'Avery (Admin)', 'Remote', 'admin', 'verified')`;
  const reviewerIds: string[] = [];
  for (const name of ["Ava Kim", "Noah Patel", "Elena Rossi", "Sam Taylor"]) {
    const [r] = await sql`
      INSERT INTO users (email, password_hash, display_name, location)
      VALUES (${`${name.split(" ")[0].toLowerCase()}@example.com`}, ${hash}, ${name}, 'USA') RETURNING id`;
    reviewerIds.push(r.id);
  }
  await sql`UPDATE users SET email_verified_at = now()`;

  // ---- live listings with three renders each (front, angle, wear close-up)
  for (const l of LISTINGS) {
    const createdAt = new Date(now - l.daysAgo * 864e5);
    const [row] = await sql`
      INSERT INTO listings (seller_id, category_id, title, brand, description, wear_notes, condition, price_cents,
                            original_price_cents, original_note, shipping_cents, pickup_only, specs, featured, created_at, updated_at)
      VALUES (${sellerIds[l.seller]}, ${l.category}, ${l.title}, ${l.brand}, ${l.description}, ${l.wear.join("\n")},
              ${l.condition}, ${Math.round(l.price * 100)}, ${Math.round(l.originalPrice * 100)}, ${l.originalNote ?? ""},
              ${Math.round(l.shipping * 100)}, ${!!l.pickupOnly}, ${sql.json(l.specs)}, ${!!l.featured}, ${createdAt}, ${createdAt})
      RETURNING id`;
    const photos = CREDITS[l.id];
    const images: { name: string; kind: "photo" | "wear_closeup"; alt: string; render: () => ReturnType<typeof renderVariants>; credit: Credit | null }[] = photos?.length
      ? photos.map((c, i) => ({
          name: c.file.replace(/\.webp$/, ""),
          kind: c.kind,
          alt: c.kind === "wear_closeup" ? `Close-up of condition on ${l.title}` : `${l.title}, photo ${i + 1}`,
          render: () => renderVariants(readFileSync(path.join(PHOTO_DIR, c.file))),
          credit: c,
        }))
      : (["front", "angle", "wear"] as ArtVariant[]).map((v) => ({
          name: `${l.id}-${v}`,
          kind: v === "wear" ? ("wear_closeup" as const) : ("photo" as const),
          alt: v === "wear" ? `Close-up of wear on ${l.title}: ${l.wear[0]}` : `${l.title}, ${v === "front" ? "front" : "angled"} view`,
          render: () => renderSeedImage(l.shape, l.hue, v),
          credit: null,
        }));
    for (const [position, im] of images.entries()) {
      const img = await im.render();
      const key = `seed/${im.name}`;
      await s.put(`${key}.webp`, img.full, "image/webp");
      await s.put(`${key}-thumb.webp`, img.thumb, "image/webp");
      await sql`
        INSERT INTO listing_images (owner_id, listing_id, kind, position, storage_key, thumb_key, width, height, alt, quality, credit)
        VALUES (${sellerIds[l.seller]}, ${row.id}, ${im.kind}, ${position}, ${`${key}.webp`}, ${`${key}-thumb.webp`},
                ${img.width}, ${img.height}, ${im.alt}, ${sql.json({ ok: true, seeded: true })},
                ${im.credit ? sql.json({ title: im.credit.title, creator: im.credit.creator, license: `CC ${im.credit.license.toUpperCase()} ${im.credit.license_version}`, licenseUrl: im.credit.license_url, sourceUrl: im.credit.source_url, changes: im.credit.changes }) : null})`;
    }
  }

  // ---- history: completed orders + reviews so ratings are real, not hard-coded
  let n = 0;
  for (const [key, sellerId] of Object.entries(sellerIds)) {
    for (let k = 0; k < 2; k++, n++) {
      const [rating, body] = REVIEW_SNIPPETS[n % REVIEW_SNIPPETS.length];
      const reviewer = reviewerIds[n % reviewerIds.length];
      const when = new Date(now - (40 + n * 9) * 864e5);
      const price = 2500 + ((n * 1731) % 9000);
      const [old] = await sql`
        INSERT INTO listings (seller_id, category_id, title, description, wear_notes, condition, price_cents, original_price_cents, status, created_at)
        VALUES (${sellerId}, ${CATEGORIES[n % CATEGORIES.length].id}, ${`Previously sold item #${n + 1} from ${SELLERS[key].name}`},
                'A previously sold item kept for order history and reviews.', 'Light wear', 'good', ${price}, ${price * 2}, 'sold', ${when})
        RETURNING id`;
      const [c] = await sql`
        INSERT INTO checkouts (buyer_id, status, total_cents, expires_at, payment_intent_id, charge_id, created_at)
        VALUES (${reviewer}, 'paid', ${price + 600}, ${when}, ${`mock_pi_seed_${n}`}, ${`mock_ch_seed_${n}`}, ${when}) RETURNING id`;
      const [o] = await sql`
        INSERT INTO orders (checkout_id, buyer_id, seller_id, status, delivery_method, items_cents, shipping_cents, protection_fee_cents,
                            platform_fee_cents, total_cents, transfer_id, paid_at, shipped_at, delivered_at, completed_at, created_at)
        VALUES (${c.id}, ${reviewer}, ${sellerId}, 'completed', 'ship', ${price}, 600, ${Math.max(100, Math.round(price * 0.03))},
                ${Math.round(price * 0.08)}, ${price + 600 + Math.max(100, Math.round(price * 0.03))}, ${`mock_tr_seed_${n}`},
                ${when}, ${when}, ${when}, ${when}, ${when}) RETURNING id`;
      await sql`INSERT INTO order_items (order_id, listing_id, title, price_cents, shipping_cents)
                VALUES (${o.id}, ${old.id}, ${`Previously sold item #${n + 1}`}, ${price}, 600)`;
      await sql`INSERT INTO reviews (order_id, reviewer_id, seller_id, rating, body, created_at)
                VALUES (${o.id}, ${reviewer}, ${sellerId}, ${rating}, ${body}, ${when})`;
    }
  }
  console.log(`seeded ${LISTINGS.length} listings, ${Object.keys(sellerIds).length} sellers, buyer ${buyer.id ? "buyer@example.com" : ""}`);
}

if (isMain(import.meta.url)) {
  (async () => {
    const [{ count }] = await sql`SELECT count(*)::int AS count FROM users`;
    if (count > 0) {
      if (process.argv.includes("--if-empty")) {
        console.log("database already seeded, skipping");
        return;
      }
      throw new Error("Database already has data. Use `npm run db:reset` to start over.");
    }
    await seed();
  })()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => sql.end());
}
