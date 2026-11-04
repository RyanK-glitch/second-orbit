import { NextResponse } from "next/server";
import { exportAccountData } from "@/lib/account";
import { requireUser } from "@/lib/auth/session";
import { route } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";

export const GET = route(async () => {
  const user = await requireUser();
  rateLimit(`export:${user.id}`, 5, 10 * 60_000);
  return new NextResponse(JSON.stringify(await exportAccountData(user.id), null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="second-orbit-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
