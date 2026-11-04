import sharp, { type Metadata } from "sharp";

/**
 * Upload pipeline for untrusted listing photos:
 *  1. Decode with sharp (rejects anything that isn't a real raster image, caps pixel count).
 *  2. Score quality: resolution, brightness, contrast and sharpness (Laplacian variance).
 *  3. Re-encode to WebP, which drops EXIF/GPS metadata and neutralises polyglot files.
 */

export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 50_000_000;
const ACCEPTED = new Set(["jpeg", "png", "webp", "avif"]);

export const THRESHOLDS = {
  minShortSide: 600, // error below this
  goodShortSide: 1000, // warning below this
  darkError: 35,
  darkWarn: 65,
  brightError: 240,
  brightWarn: 220,
  lowContrast: 18,
  blurError: 6, // stdev of Laplacian response on a 640px-wide greyscale copy
  blurWarn: 11,
};

export type QualityIssue = { code: string; severity: "error" | "warning"; message: string };
export type QualityReport = {
  ok: boolean;
  issues: QualityIssue[];
  metrics: { width: number; height: number; brightness: number; contrast: number; sharpness: number };
};

export class ImageRejected extends Error {}

async function decode(input: Buffer) {
  if (input.length > MAX_UPLOAD_BYTES) throw new ImageRejected("Photos must be 12 MB or smaller.");
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new ImageRejected("That file isn't a readable image. Use JPEG, PNG, WebP or AVIF.");
  }
  if (!meta.format || !ACCEPTED.has(meta.format)) {
    throw new ImageRejected("Unsupported format. Use JPEG, PNG, WebP or AVIF.");
  }
  if ((meta.pages ?? 1) > 1) throw new ImageRejected("Animated images aren't supported.");
  return meta;
}

export async function analyzeImage(input: Buffer): Promise<QualityReport> {
  await decode(input);
  const oriented = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate();
  const { width = 0, height = 0 } = await oriented.clone().toBuffer({ resolveWithObject: true }).then((r) => r.info);

  // Metrics are computed on a normalised 640px-wide greyscale copy so scores don't depend on camera resolution.
  const { data, info } = await oriented
    .clone()
    .resize({ width: 640 })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { brightness, contrast, sharpness } = pixelMetrics(data, info.width, info.height);

  const t = THRESHOLDS;
  const issues: QualityIssue[] = [];
  const shortSide = Math.min(width, height);
  if (shortSide < t.minShortSide) {
    issues.push({ code: "too_small", severity: "error", message: `Too small (${width}×${height}). Use a photo at least ${t.minShortSide}px on its shortest side.` });
  } else if (shortSide < t.goodShortSide) {
    issues.push({ code: "low_resolution", severity: "warning", message: `Low resolution (${width}×${height}). Buyers zoom in, so ${t.goodShortSide}px or more looks better.` });
  }
  if (brightness < t.darkError) {
    issues.push({ code: "too_dark", severity: "error", message: "Too dark to see the item. Retake it in daylight or under a bright lamp." });
  } else if (brightness < t.darkWarn) {
    issues.push({ code: "dark", severity: "warning", message: "A bit dark. More light will show the condition more clearly." });
  } else if (brightness > t.brightError) {
    issues.push({ code: "overexposed", severity: "error", message: "Overexposed: details are washed out. Avoid direct flash or strong backlight." });
  } else if (brightness > t.brightWarn) {
    issues.push({ code: "bright", severity: "warning", message: "Very bright. Check that scratches and marks are still visible." });
  }
  if (contrast < t.lowContrast) {
    issues.push({ code: "low_contrast", severity: "warning", message: "Low contrast. A plain background that differs from the item helps." });
  }
  if (sharpness < t.blurError) {
    issues.push({ code: "blurry", severity: "error", message: "Too blurry. Hold steady, tap to focus, and retake." });
  } else if (sharpness < t.blurWarn) {
    issues.push({ code: "soft", severity: "warning", message: "Slightly soft focus. A sharper shot builds buyer trust." });
  }

  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    metrics: { width, height, brightness: r(brightness), contrast: r(contrast), sharpness: r(sharpness) },
  };
}

/** Mean/stdev of luminance, and stdev of the 4-neighbour Laplacian (focus measure). */
function pixelMetrics(px: Buffer, w: number, h: number) {
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < px.length; i++) {
    sum += px[i];
    sumSq += px[i] * px[i];
  }
  const n = px.length;
  const brightness = sum / n;
  const contrast = Math.sqrt(Math.max(0, sumSq / n - brightness * brightness));

  let lSum = 0;
  let lSq = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = px[i - w] + px[i + w] + px[i - 1] + px[i + 1] - 4 * px[i];
      lSum += v;
      lSq += v * v;
      count++;
    }
  }
  const lMean = lSum / Math.max(1, count);
  const sharpness = Math.sqrt(Math.max(0, lSq / Math.max(1, count) - lMean * lMean));
  return { brightness, contrast, sharpness };
}

/** Normalised WebP renditions with all metadata stripped. */
export async function renderVariants(input: Buffer) {
  await decode(input);
  const base = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate();
  const full = await base
    .clone()
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  const thumb = await base.clone().resize({ width: 600, height: 600, fit: "cover" }).webp({ quality: 78 }).toBuffer();
  return { full: full.data, thumb, width: full.info.width, height: full.info.height };
}
