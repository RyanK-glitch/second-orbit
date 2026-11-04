import { requireUser } from "@/lib/auth/session";
import { badRequest, route } from "@/lib/http";
import { MAX_UPLOAD_BYTES } from "@/lib/images";
import { uploadImage } from "@/lib/listing-service";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Multipart upload of one listing photo. The file is decoded, quality-checked
 * and re-encoded server-side; the original bytes are never stored or served.
 */
export const POST = route(async (req) => {
  const user = await requireUser();
  rateLimit(`upload:${user.id}`, 60, 10 * 60_000);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) throw badRequest("Photos must be 12 MB or smaller.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Upload a photo using the form.");
  }
  const file = form.get("file");
  const kind = form.get("kind") === "wear_closeup" ? "wear_closeup" : "photo";
  if (!(file instanceof File) || file.size === 0) throw badRequest("Choose a photo to upload.");
  return uploadImage(user, file, kind);
});
