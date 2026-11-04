import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { config } from "@/lib/env";
import { route } from "@/lib/http";

// Plain form POST from the account menu; redirects home afterwards.
export const POST = route(async () => {
  await destroySession();
  return NextResponse.redirect(new URL("/", config.appUrl), 303);
});
