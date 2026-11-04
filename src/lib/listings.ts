import { sql } from "./db";
import { CONDITIONS, type Condition, type SortKey, SORTS } from "./catalog";
import { storage } from "./integrations";

export type ListingImage = {
  id: string;
  kind: "photo" | "wear_closeup";
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  alt: string;
  credit: ImageCredit | null;
};

export type ImageCredit = { title: string; creator: string; license: string; licenseUrl: string; sourceUrl: string; changes: string };

export type ListingCard = {
  id: string;
  title: string;
  brand: string;
  categoryId: string;
  condition: Condition;
  priceCents: number;
  originalPriceCents: number;
  status: "active" | "reserved" | "sold" | "removed";
  available: boolean;
  createdAt: Date;
  sellerId: string;
  sellerName: string;
  sellerLocation: string;
  image: ListingImage | null;
};

export type ListingDetail = ListingCard & {
  description: string;
  wearNotes: string;
  originalNote: string;
  shippingCents: number;
  pickupOnly: boolean;
  specs: Record<string, string>;
  categoryName: string;
  images: ListingImage[];
  updatedAt: Date;
  seller: SellerSummary;
};

export type SellerSummary = {
  id: string;
  displayName: string;
  location: string;
  bio: string;
  verified: boolean;
  memberSince: Date;
  sales: number;
  rating: number | null;
  reviewCount: number;
};

export type Category = { id: string; name: string; blurb: string; count: number };

// A reservation that has lapsed counts as available again.
const AVAILABLE = sql`(l.status = 'active' OR (l.status = 'reserved' AND l.reserved_until < now()))`;
const VISIBLE_SELLER = sql`u.suspended_at IS NULL`;

function mapImage(row: { id: string; kind: "photo" | "wear_closeup"; storage_key: string; thumb_key: string; width: number; height: number; alt: string; credit?: ImageCredit | null }): ListingImage {
  const s = storage();
  return {
    id: row.id,
    kind: row.kind,
    url: s.publicUrl(row.storage_key),
    thumbUrl: s.publicUrl(row.thumb_key),
    width: row.width,
    height: row.height,
    alt: row.alt,
    credit: row.credit ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCard(r: any): ListingCard {
  return {
    id: r.id,
    title: r.title,
    brand: r.brand,
    categoryId: r.category_id,
    condition: r.condition,
    priceCents: r.price_cents,
    originalPriceCents: r.original_price_cents,
    status: r.status,
    available: r.available,
    createdAt: r.created_at,
    sellerId: r.seller_id,
    sellerName: r.seller_name,
    sellerLocation: r.seller_location,
    image: r.img_id
      ? mapImage({ id: r.img_id, kind: r.img_kind, storage_key: r.img_key, thumb_key: r.img_thumb, width: r.img_w, height: r.img_h, alt: r.img_alt })
      : null,
  };
}

const CARD_COLUMNS = sql`
  l.id, l.title, l.brand, l.category_id, l.condition, l.price_cents, l.original_price_cents, l.status,
  l.created_at, l.seller_id, ${AVAILABLE} AS available,
  u.display_name AS seller_name, u.location AS seller_location,
  img.id AS img_id, img.kind AS img_kind, img.storage_key AS img_key, img.thumb_key AS img_thumb,
  img.width AS img_w, img.height AS img_h, img.alt AS img_alt`;

const CARD_JOINS = sql`
  JOIN users u ON u.id = l.seller_id
  LEFT JOIN LATERAL (
    SELECT * FROM listing_images li WHERE li.listing_id = l.id ORDER BY li.kind = 'wear_closeup', li.position LIMIT 1
  ) img ON true`;

export type SearchFilters = {
  q?: string;
  categories?: string[];
  conditions?: Condition[];
  minCents?: number;
  maxCents?: number;
  shipsOnly?: boolean;
  sort?: SortKey;
  page?: number;
  pageSize?: number;
};

/**
 * Turns free text into a safe prefix tsquery ("sony head" → "sony:* & head:*").
 * Only letters/digits survive, so user input can't inject tsquery syntax.
 */
export function toPrefixQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "") // drop accents to match the unaccented index
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0)
    .slice(0, 8);
  return tokens.length ? tokens.map((t) => `${t}:*`).join(" & ") : null;
}

export function parseFilters(params: Record<string, string | string[] | undefined>): SearchFilters {
  const one = (k: string) => {
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const list = (k: string) => (one(k) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const dollars = (k: string) => {
    const n = Number.parseFloat(one(k) ?? "");
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : undefined;
  };
  const sort = one("sort");
  const page = Number.parseInt(one("page") ?? "1", 10);
  return {
    q: (one("q") ?? "").slice(0, 100),
    categories: list("cat").slice(0, 10),
    conditions: list("cond").filter((c): c is Condition => (CONDITIONS as readonly string[]).includes(c)),
    minCents: dollars("min"),
    maxCents: dollars("max"),
    shipsOnly: one("ships") === "1",
    sort: SORTS.some((s) => s.value === sort) ? (sort as SortKey) : undefined,
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 500) : 1,
  };
}

export async function searchListings(f: SearchFilters) {
  const pageSize = f.pageSize ?? 24;
  const page = f.page ?? 1;
  const tsq = f.q ? toPrefixQuery(f.q) : null;
  const sort: SortKey = f.sort ?? (tsq ? "relevance" : "newest");

  const where = [AVAILABLE, VISIBLE_SELLER];
  if (tsq) where.push(sql`l.search @@ to_tsquery('english', ${tsq})`);
  if (f.categories?.length) where.push(sql`l.category_id = ANY(${f.categories})`);
  if (f.conditions?.length) where.push(sql`l.condition = ANY(${f.conditions}::item_condition[])`);
  if (f.minCents != null) where.push(sql`l.price_cents >= ${f.minCents}`);
  if (f.maxCents != null) where.push(sql`l.price_cents <= ${f.maxCents}`);
  if (f.shipsOnly) where.push(sql`NOT l.pickup_only`);
  const whereSql = where.reduce((acc, w, i) => (i === 0 ? sql`${w}` : sql`${acc} AND ${w}`), sql``);

  const order =
    sort === "price_asc"
      ? sql`l.price_cents ASC, l.created_at DESC`
      : sort === "price_desc"
        ? sql`l.price_cents DESC, l.created_at DESC`
        : sort === "condition"
          ? sql`array_position(ARRAY['fair','good','excellent','mint']::item_condition[], l.condition) DESC, l.created_at DESC`
          : sort === "relevance" && tsq
            ? sql`ts_rank_cd(l.search, to_tsquery('english', ${tsq})) DESC, l.created_at DESC`
            : sql`l.created_at DESC`;

  const rows = await sql`
    SELECT ${CARD_COLUMNS}, count(*) OVER() AS total
    FROM listings l ${CARD_JOINS}
    WHERE ${whereSql}
    ORDER BY ${order}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  return {
    items: rows.map(mapCard),
    total: rows.length ? Number(rows[0].total) : 0,
    page,
    pageSize,
    sort,
  };
}

export async function featuredListings(limit = 8) {
  const rows = await sql`
    SELECT ${CARD_COLUMNS} FROM listings l ${CARD_JOINS}
    WHERE ${AVAILABLE} AND ${VISIBLE_SELLER} AND l.featured
    ORDER BY l.created_at DESC LIMIT ${limit}`;
  return rows.map(mapCard);
}

export async function recentListings(limit = 8) {
  const rows = await sql`
    SELECT ${CARD_COLUMNS} FROM listings l ${CARD_JOINS}
    WHERE ${AVAILABLE} AND ${VISIBLE_SELLER}
    ORDER BY l.created_at DESC LIMIT ${limit}`;
  return rows.map(mapCard);
}

export async function listingsBySeller(sellerId: string, opts: { includeInactive?: boolean; limit?: number } = {}) {
  const rows = await sql`
    SELECT ${CARD_COLUMNS} FROM listings l ${CARD_JOINS}
    WHERE l.seller_id = ${sellerId} AND ${opts.includeInactive ? sql`l.status <> 'removed'` : AVAILABLE}
    ORDER BY l.created_at DESC LIMIT ${opts.limit ?? 48}`;
  return rows.map(mapCard);
}

export async function similarListings(listingId: string, categoryId: string, limit = 4) {
  const rows = await sql`
    SELECT ${CARD_COLUMNS} FROM listings l ${CARD_JOINS}
    WHERE ${AVAILABLE} AND ${VISIBLE_SELLER} AND l.category_id = ${categoryId} AND l.id <> ${listingId}
    ORDER BY l.created_at DESC LIMIT ${limit}`;
  return rows.map(mapCard);
}

export async function savedListings(userId: string) {
  const rows = await sql`
    SELECT ${CARD_COLUMNS} FROM saved_items s JOIN listings l ON l.id = s.listing_id ${CARD_JOINS}
    WHERE s.user_id = ${userId} AND l.status <> 'removed'
    ORDER BY s.created_at DESC`;
  return rows.map(mapCard);
}

export async function getCategories(): Promise<Category[]> {
  const rows = await sql`
    SELECT c.id, c.name, c.blurb,
      (SELECT count(*) FROM listings l JOIN users u ON u.id = l.seller_id
        WHERE l.category_id = c.id AND ${AVAILABLE} AND ${VISIBLE_SELLER})::int AS count
    FROM categories c ORDER BY c.sort`;
  return rows.map((r) => ({ id: r.id, name: r.name, blurb: r.blurb, count: r.count }));
}

export async function getSellerSummary(userId: string): Promise<SellerSummary | null> {
  const [r] = await sql`
    SELECT u.id, u.display_name, u.location, u.bio, u.verification_status, u.created_at, u.suspended_at, u.deleted_at,
      (SELECT count(*) FROM orders o WHERE o.seller_id = u.id AND o.status = 'completed')::int AS sales,
      (SELECT avg(rating)::float FROM reviews r WHERE r.seller_id = u.id) AS rating,
      (SELECT count(*) FROM reviews r WHERE r.seller_id = u.id)::int AS review_count
    FROM users u WHERE u.id = ${userId}`;
  if (!r || r.suspended_at || r.deleted_at) return null;
  return {
    id: r.id,
    displayName: r.display_name,
    location: r.location,
    bio: r.bio,
    verified: r.verification_status === "verified",
    memberSince: r.created_at,
    sales: r.sales,
    rating: r.rating == null ? null : Math.round(r.rating * 10) / 10,
    reviewCount: r.review_count,
  };
}

/** Full listing for the product page. Removed listings and suspended sellers 404 (except for the owner). */
export async function getListing(id: string, viewerId?: string | null): Promise<ListingDetail | null> {
  const [r] = await sql`
    SELECT ${CARD_COLUMNS}, l.description, l.wear_notes, l.original_note, l.shipping_cents, l.pickup_only,
      l.specs, l.updated_at, c.name AS category_name, u.suspended_at
    FROM listings l ${CARD_JOINS} JOIN categories c ON c.id = l.category_id
    WHERE l.id = ${id}`;
  if (!r) return null;
  const isOwner = viewerId === r.seller_id;
  if (!isOwner && (r.status === "removed" || r.suspended_at)) return null;
  const [images, seller] = await Promise.all([
    sql`SELECT id, kind, storage_key, thumb_key, width, height, alt, credit FROM listing_images
        WHERE listing_id = ${id} ORDER BY kind = 'wear_closeup', position`,
    getSellerSummary(r.seller_id),
  ]);
  return {
    ...mapCard(r),
    description: r.description,
    wearNotes: r.wear_notes,
    originalNote: r.original_note,
    shippingCents: r.shipping_cents,
    pickupOnly: r.pickup_only,
    specs: r.specs ?? {},
    categoryName: r.category_name,
    updatedAt: r.updated_at,
    images: images.map((i) => mapImage(i as never)),
    seller: seller ?? {
      id: r.seller_id,
      displayName: r.seller_name,
      location: r.seller_location,
      bio: "",
      verified: false,
      memberSince: r.created_at,
      sales: 0,
      rating: null,
      reviewCount: 0,
    },
  };
}

export async function isSaved(userId: string, listingId: string) {
  const [r] = await sql`SELECT 1 FROM saved_items WHERE user_id = ${userId} AND listing_id = ${listingId}`;
  return !!r;
}

export async function sitemapListings() {
  return sql`
    SELECT l.id, l.updated_at FROM listings l JOIN users u ON u.id = l.seller_id
    WHERE ${AVAILABLE} AND ${VISIBLE_SELLER} ORDER BY l.updated_at DESC LIMIT 45000`;
}
