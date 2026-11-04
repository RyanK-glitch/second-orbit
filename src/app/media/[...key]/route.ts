import { readFile } from "node:fs/promises";
import path from "node:path";
import { config, integrations } from "@/lib/env";

/**
 * Serves locally stored media (mock storage adapter). Mirrors the CDN URL
 * scheme: /media/<key>, immutable, WebP only. With S3 configured, media URLs
 * point at the bucket/CDN and this route is unused.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (integrations().storage !== "local-disk") return new Response("Not found", { status: 404 });
  const { key } = await params;
  const rel = key.join("/");
  if (!/^[a-z0-9][a-z0-9/_.-]*\.webp$/i.test(rel) || rel.includes("..")) return new Response("Not found", { status: 404 });
  const root = path.resolve(config.mediaDir);
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep)) return new Response("Not found", { status: 404 });
  try {
    const body = await readFile(file);
    return new Response(body, {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
