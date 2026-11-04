import { DeleteObjectCommand, PutBucketPolicyCommand, PutObjectCommand, S3Client, CreateBucketCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../env";
import type { StorageAdapter } from "./types";

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]{0,200}$/i;
function checkKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error(`Unsafe storage key: ${key}`);
}

let s3: S3Client | null = null;
function client() {
  s3 ??= new S3Client({
    region: config.s3.region,
    ...(config.s3.endpoint ? { endpoint: config.s3.endpoint } : {}),
    forcePathStyle: config.s3.forcePathStyle,
    ...(config.s3.accessKeyId
      ? { credentials: { accessKeyId: config.s3.accessKeyId, secretAccessKey: config.s3.secretAccessKey } }
      : {}),
  });
  return s3;
}

/** Any S3-compatible bucket: AWS S3, Cloudflare R2, RustFS. Put a CDN in front via MEDIA_PUBLIC_URL. */
export const s3Storage: StorageAdapter = {
  name: "s3",
  async put(key, body, contentType) {
    checkKey(key);
    await client().send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  },
  async delete(key) {
    checkKey(key);
    await client().send(new DeleteObjectCommand({ Bucket: config.s3.bucket, Key: key }));
  },
  publicUrl(key) {
    if (config.mediaPublicUrl) return `${config.mediaPublicUrl}/${key}`;
    if (config.s3.endpoint) return `${config.s3.endpoint.replace(/\/$/, "")}/${config.s3.bucket}/${key}`;
    return `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
  },
  async ensureReady() {
    if (!config.s3.createBucket) return;
    const Bucket = config.s3.bucket;
    try {
      await client().send(new HeadBucketCommand({ Bucket }));
    } catch {
      await client().send(new CreateBucketCommand({ Bucket }));
    }
    // Media is public by design (listing photos); keep anything private out of this bucket.
    await client().send(
      new PutBucketPolicyCommand({
        Bucket,
        Policy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [{ Effect: "Allow", Principal: "*", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${Bucket}/*`] }],
        }),
      }),
    );
  },
};

/** Mock: files on local disk, served by /media/[...key] with immutable caching. */
export const localDiskStorage: StorageAdapter = {
  name: "local-disk",
  async put(key, body) {
    checkKey(key);
    const file = path.join(path.resolve(config.mediaDir), key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
  },
  async delete(key) {
    checkKey(key);
    await rm(path.join(path.resolve(config.mediaDir), key), { force: true });
  },
  publicUrl(key) {
    return `${config.mediaPublicUrl || "/media"}/${key}`;
  },
};
