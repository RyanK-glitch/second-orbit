import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { integrations } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Liveness + which adapter each integration is using (no secrets). */
export async function GET() {
  try {
    await sql`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up", integrations: integrations() });
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
