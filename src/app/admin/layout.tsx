import type { Metadata } from "next";
import { AdminNav, type AdminLink } from "@/components/admin/AdminNav";
import { notFound } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { sql } from "@/lib/db";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Back office shell. Every page enforces its own permission (and redirects signed-out visitors to
 * sign-in with the exact page as `next`, which a layout can't know), so signed-out requests fall
 * through to the page's guard; signed-in members without access get a 404 here.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) return children;
  if (!can(user, "admin.view")) notFound();
  const [{ open, chargebacks }] = await sql`
    SELECT ((SELECT count(*) FROM disputes WHERE status = 'open') + (SELECT count(*) FROM reports WHERE status = 'open'))::int AS open,
           (SELECT count(*) FROM chargebacks WHERE status = 'open')::int AS chargebacks`;
  const links: AdminLink[] = [
    { href: "/admin", label: "Overview" },
    { href: "/admin/moderation", label: "Moderation queue", badge: open },
    ...(can(user, "moderation.act") ? [{ href: "/admin/chargebacks", label: "Chargebacks", badge: chargebacks }] : []),
    { href: "/admin/users", label: "Users" },
    { href: "/admin/listings", label: "Listings" },
    { href: "/admin/orders", label: "Orders" },
    ...(can(user, "categories.manage") ? [{ href: "/admin/categories", label: "Categories" }] : []),
    { href: "/admin/audit", label: "Audit log" },
  ];
  return (
    <div className="account-layout admin-layout">
      <AdminNav links={links} />
      <div>{children}</div>
    </div>
  );
}
