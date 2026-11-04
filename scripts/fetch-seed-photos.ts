/**
 * Downloads the openly licensed (CC BY) product photos listed in
 * db/seed-photos/sources.json, re-encodes them to WebP (stripping metadata),
 * and writes db/seed-photos/<listing>-<n>.webp plus a wear close-up for each.
 *
 * The processed photos are committed, so seeding never needs the network.
 * Run this only to refresh them:  npx tsx scripts/fetch-seed-photos.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Sharp } from "sharp";

type Source = { role: "photo" | "wear"; url: string; title: string; creator: string; license: string; license_version: string; license_url: string; source_url: string };
type Credit = Omit<Source, "url" | "role"> & { file: string; kind: "photo" | "wear_closeup"; changes: string };

const DIR = path.resolve("db/seed-photos");
const MAX_BYTES = 25 * 1024 * 1024;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polite download: descriptive User-Agent (Wikimedia policy), pacing, and backoff on 429/5xx. */
async function download(url: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    await sleep(1500);
    const res = await fetch(url, {
      headers: { "User-Agent": "SecondOrbitSeed/0.1 (demo marketplace seed photos; https://github.com/)" },
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_BYTES) throw new Error(`too large: ${url}`);
      return buf;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      await sleep(Number(res.headers.get("retry-after") ?? 0) * 1000 || 5000 * attempt);
      continue;
    }
    throw new Error(`${res.status} for ${url}`);
  }
}

/** Decoding through sharp validates the file; output is a fresh WebP with no metadata. */
const toWebp = (img: Sharp) => img.resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();

async function main() {
  const sources: Record<string, Source[]> = JSON.parse(await readFile(path.join(DIR, "sources.json"), "utf8"));
  const credits: Record<string, Credit[]> = {};
  for (const [listing, list] of Object.entries(sources)) {
    credits[listing] = [];
    let n = 0;
    let firstBuf: Buffer | null = null;
    let firstSrc: Source | null = null;
    for (const src of list) {
      const raw = await download(src.url);
      const img = sharp(raw, { limitInputPixels: 80_000_000 }).rotate();
      const file = src.role === "wear" ? `${listing}-wear.webp` : `${listing}-${++n}.webp`;
      await writeFile(path.join(DIR, file), await toWebp(img));
      const { url: _u, role: _r, ...meta } = src;
      credits[listing].push({ ...meta, file, kind: src.role === "wear" ? "wear_closeup" : "photo", changes: "resized and re-encoded" });
      if (!firstBuf && src.role === "photo") {
        firstBuf = raw;
        firstSrc = src;
      }
      process.stdout.write(".");
    }
    // No dedicated detail shot: crop a close-up from the main photo.
    if (!list.some((s) => s.role === "wear") && firstBuf && firstSrc) {
      const meta = await sharp(firstBuf).rotate().metadata();
      const w = meta.autoOrient?.width ?? meta.width!;
      const h = meta.autoOrient?.height ?? meta.height!;
      const size = Math.round(Math.min(w, h) * 0.55);
      const crop = sharp(firstBuf).rotate().extract({ left: Math.round((w - size) / 2), top: Math.round((h - size) / 2), width: size, height: size });
      const file = `${listing}-wear.webp`;
      await writeFile(path.join(DIR, file), await crop.resize(1200, 1200, { fit: "cover" }).webp({ quality: 84 }).toBuffer());
      const { url: _u, role: _r, ...m } = firstSrc;
      credits[listing].push({ ...m, file, kind: "wear_closeup", changes: "cropped, resized and re-encoded" });
    }
  }
  await writeFile(path.join(DIR, "credits.json"), JSON.stringify(credits, null, 2));
  console.log(`\nwrote ${Object.values(credits).flat().length} photos`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
