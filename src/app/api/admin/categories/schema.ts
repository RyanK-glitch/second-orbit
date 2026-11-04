import { z } from "zod";
import { cleanLine } from "@/lib/sanitize";

export const categorySchema = z.object({
  name: z.string().transform((s) => cleanLine(s, 40)).pipe(z.string().min(2, "Enter a name.")),
  blurb: z.string().transform((s) => cleanLine(s, 120)),
  sort: z.number().int().min(0).max(1000),
});

export const categoryIdSchema = z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/, "Use 1–30 lowercase letters, digits or dashes.");
