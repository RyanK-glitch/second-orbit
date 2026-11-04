import { z } from "zod";
import { deleteAccount } from "@/lib/account";
import { requireUser } from "@/lib/auth/session";
import { parseJson, route } from "@/lib/http";

const schema = z.object({
  confirmEmail: z.string().trim().min(3, "Type your account email to confirm.").max(200),
  password: z.string().max(200).optional(),
  code: z.string().trim().max(20).optional(),
});

/** Deletes the signed-in member's own account. */
export const DELETE = route(async (req) => {
  const user = await requireUser();
  await deleteAccount(user, await parseJson(req, schema));
  return { redirect: "/account-deleted" };
});
