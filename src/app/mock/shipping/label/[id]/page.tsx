import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/page";
import { sql } from "@/lib/db";
import { isMock } from "@/lib/env";
import { isUuid } from "@/lib/http";
import type { Address } from "@/lib/integrations/types";
import { SAMPLE_ADDRESS } from "@/lib/orders";

export const metadata: Metadata = { title: "Shipping label", robots: { index: false } };
export const dynamic = "force-dynamic";

/** Printable mock label. With EasyPost keys, labelUrl points to the carrier PNG/PDF instead. */
export default async function MockLabel({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMock("shipping") || !isUuid(id)) notFound();
  const user = await requirePageUser(`/mock/shipping/label/${id}`);
  const [row] = await sql`
    SELECT s.*, o.ship_to, o.seller_id, u.display_name, u.ship_from FROM shipments s
    JOIN orders o ON o.id = s.order_id JOIN users u ON u.id = o.seller_id WHERE s.order_id = ${id}`;
  if (!row || row.seller_id !== user.id) notFound();
  const to = (row.ship_to as Address | null) ?? SAMPLE_ADDRESS;
  const from = (row.ship_from as Address | null) ?? { ...SAMPLE_ADDRESS, name: row.display_name };
  const addr = (a: Address) => [a.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.postalCode}`].filter(Boolean).join("\n");
  return (
    <div className="glass" style={{ maxWidth: 520, margin: "0 auto", padding: 24, border: "2px solid #000", background: "#fff", color: "#000" }}>
      <h1 style={{ color: "#000", fontSize: "1.3rem" }}>{row.carrier} {row.service}: TEST LABEL</h1>
      <p style={{ whiteSpace: "pre-line" }}><strong>FROM</strong><br />{addr(from)}</p>
      <p style={{ whiteSpace: "pre-line", fontSize: "1.2rem" }}><strong>TO</strong><br />{addr(to)}</p>
      <p style={{ fontFamily: "var(--font-mono)", fontSize: "1.1rem", letterSpacing: ".1em", borderTop: "2px solid #000", paddingTop: 12 }}>
        TRACKING {row.tracking_code}
      </p>
      <p style={{ fontSize: ".85rem" }}>Mock carrier label. Not valid for postage.</p>
    </div>
  );
}
