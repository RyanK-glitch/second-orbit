import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { beginEnrollment, confirmEnrollment, disableTwoFactor } from "@/lib/auth/two-factor";
import { parseJson, route } from "@/lib/http";

const schema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("begin") }),
  z.object({ op: z.literal("confirm"), code: z.string().trim().min(6, "Enter the 6-digit code.").max(20) }),
  z.object({ op: z.literal("disable"), code: z.string().trim().min(6, "Enter your code.").max(20) }),
]);

export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, schema);
  if (input.op === "begin") return beginEnrollment(user);
  if (input.op === "confirm") return confirmEnrollment(user, input.code);
  await disableTwoFactor(user, input.code);
  return { ok: true };
});
