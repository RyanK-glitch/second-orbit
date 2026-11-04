import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";
import { cleanLine, cleanText } from "@/lib/sanitize";
import { updateProfile } from "@/lib/users";

const line = (max: number) => z.string().default("").transform((s) => cleanLine(s, max));

const schema = z.object({
  displayName: z.string().transform((s) => cleanLine(s, 60)).pipe(z.string().min(2, "Enter a name of at least 2 characters.")),
  location: line(80),
  bio: z.string().default("").transform((s) => cleanText(s, 500)),
  shipFrom: z
    .object({
      name: line(80).pipe(z.string().min(2, "Enter the sender name.")),
      line1: line(120).pipe(z.string().min(3, "Enter a street address.")),
      line2: line(120),
      city: line(80).pipe(z.string().min(2, "Enter a city.")),
      state: line(40).pipe(z.string().min(2, "Enter a state.")),
      postalCode: line(20).pipe(z.string().regex(/^\d{5}(-\d{4})?$/, "Enter a 5-digit ZIP code.")),
      country: z.literal("US").default("US"),
    })
    .nullable()
    .default(null),
});

export const PATCH = route(async (req) => {
  const user = await requireUser();
  await updateProfile(user, await parseJson(req, schema));
  return { ok: true };
});
