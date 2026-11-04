import type { MetadataRoute } from "next";
import { config } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/account/", "/admin/", "/messages", "/mock/", "/cart", "/checkout/", "/reset-password", "/verify-email"] }],
    sitemap: `${config.appUrl}/sitemap.xml`,
  };
}
