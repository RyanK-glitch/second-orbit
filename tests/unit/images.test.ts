import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { analyzeImage, ImageRejected, renderVariants } from "@/lib/images";
import { productPhoto } from "../fixtures/photos";

describe("image quality checks", () => {
  it("accepts a sharp, well-lit photo", async () => {
    const r = await analyzeImage(await productPhoto());
    expect(r.ok).toBe(true);
    expect(r.issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("rejects a blurry photo", async () => {
    const blurry = await sharp(await productPhoto()).blur(8).jpeg().toBuffer();
    const r = await analyzeImage(blurry);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toContain("blurry");
  });

  it("rejects a photo that is too dark", async () => {
    const dark = await sharp(await productPhoto()).linear(0.15, 0).jpeg().toBuffer();
    expect((await analyzeImage(dark)).issues.map((i) => i.code)).toContain("too_dark");
  });

  it("rejects a photo that is too small", async () => {
    const tiny = await sharp(await productPhoto()).resize(400).jpeg().toBuffer();
    expect((await analyzeImage(tiny)).issues.map((i) => i.code)).toContain("too_small");
  });

  it("warns (but accepts) moderate resolution", async () => {
    const mid = await sharp(await productPhoto()).resize(900).jpeg().toBuffer();
    const r = await analyzeImage(mid);
    expect(r.ok).toBe(true);
    expect(r.issues.map((i) => i.code)).toContain("low_resolution");
  });

  it("refuses files that aren't images", async () => {
    await expect(analyzeImage(Buffer.from("<?php echo 'hi'; ?>"))).rejects.toBeInstanceOf(ImageRejected);
  });

  it("strips EXIF/GPS metadata when re-encoding", async () => {
    const withExif = await sharp(await productPhoto())
      .withExif({ IFD0: { Copyright: "secret" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "37/1 46/1 0/1" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await renderVariants(withExif);
    const meta = await sharp(out.full).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(1600);
  });
});
