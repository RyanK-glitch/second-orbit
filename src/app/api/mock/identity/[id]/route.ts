import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { sql } from "@/lib/db";
import { isMock } from "@/lib/env";
import { forbidden, notFound, parseJson, route } from "@/lib/http";

const schema = z.object({ result: z.enum(["verified", "failed"]) });

/** Mock of Stripe Identity's hosted flow outcome, for the caller's own session only. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  if (!isMock("identity")) throw notFound();
  const sessionId = (await params).id;
  const user = await requireUser();
  const [u] = await sql`SELECT id FROM users WHERE identity_session_id = ${sessionId}`;
  if (!u || u.id !== user.id) throw forbidden();
  const { result } = await parseJson(req, schema);
  await sql`UPDATE users SET verification_status = ${result} WHERE id = ${user.id}`;
  return { redirect: "/account/verification/return" };
});
