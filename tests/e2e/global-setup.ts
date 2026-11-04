import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { productPhoto } from "../fixtures/photos";

/** Generates upload fixtures: good photos, a wear close-up and a blurry shot. */
export default async function globalSetup() {
  const dir = path.resolve("tests/fixtures/generated");
  await mkdir(dir, { recursive: true });
  const good = await productPhoto(1600, 1200, 200);
  await writeFile(path.join(dir, "good-photo.jpg"), good);
  await writeFile(path.join(dir, "wear-closeup.jpg"), await productPhoto(1400, 1400, 30));
  await writeFile(path.join(dir, "blurry.jpg"), await sharp(good).blur(8).jpeg().toBuffer());
}
