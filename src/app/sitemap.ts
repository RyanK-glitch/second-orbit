import type { MetadataRoute } from "next";
import { config } from "@/lib/env";
import { getCategories, sitemapListings } from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = config.appUrl;
  const [listings, categories] = await Promise.all([sitemapListings(), getCategories()]);
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/shop`, changeFrequency: "hourly", priority: 0.9 },
    ...["help", "contact", "fees", "buyer-protection", "seller-agreement", "prohibited-items", "terms", "privacy", "cookies"].map((p) => ({
      url: `${base}/${p}`,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
    ...categories.map((c) => ({ url: `${base}/shop?cat=${c.id}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...listings.map((l) => ({ url: `${base}/listings/${l.id}`, lastModified: l.updated_at, changeFrequency: "daily" as const, priority: 0.8 })),
  ];
}
