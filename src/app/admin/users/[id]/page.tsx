import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { UserControls } from "@/components/admin/AdminActions";
import { Breadcrumbs, fmtDate } from "@/components/bits";
import { getUserDetail } from "@/lib/admin";
import { requirePagePermission } from "@/lib/auth/page";
import { can } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/http";

export const metadata: Metadata = { title: "User", robots: { index: false } };
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = { user: "Member", moderator: "Moderator", admin: "Admin" };

export default async function AdminUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requirePagePermission("admin.view", `/admin/users/${id}`);
  if (!isUuid(id)) notFound();
  const { user: u, accounts, history } = await getUserDetail(id).catch(() => notFound());
  const self = me.id === u.id;
  const canManage = !self && can(me, "users.manage");
  const canSuspend = !self && (u.role === "user" ? can(me, "users.suspend") : can(me, "users.manage"));
  return (
    <>
      <Breadcrumbs items={[{ label: "Users", href: "/admin/users" }, { label: u.display_name }]} />
      <div className="page-head">
        <span className="eyebrow">{ROLE_LABEL[u.role]}{u.suspended_at ? " · Disabled" : ""}</span>
        <h1>{u.display_name}</h1>
        <p>{u.email}</p>
      </div>
      <div className="order-grid">
        <section className="glass mod-card" aria-labelledby="facts">
          <h2 id="facts">Account</h2>
          <dl className="kv">
            <dt>Joined</dt><dd>{fmtDate(u.created_at)}</dd>
            <dt>Status</dt><dd>{u.suspended_at ? `Disabled ${fmtDate(u.suspended_at)}` : "Active"}</dd>
            <dt>Email verified</dt><dd>{u.email_verified_at ? fmtDate(u.email_verified_at) : "No"}</dd>
            <dt>Sign-in</dt>
            <dd>
              {[u.has_password && "Password", ...accounts.map((a) => `${a.provider[0].toUpperCase()}${a.provider.slice(1)}${a.is_private_email ? " (private relay)" : ""}`)].filter(Boolean).join(", ") || "None"}
            </dd>
            <dt>Active sessions</dt><dd>{u.active_sessions}</dd>
            <dt>ID verification</dt><dd>{u.verification_status}</dd>
            <dt>Payouts</dt><dd>{u.payouts_enabled ? "Connected" : "Not set up"}</dd>
            <dt>Listings</dt><dd>{u.listings} · <Link href={`/admin/listings?q=${encodeURIComponent(u.display_name)}`}>View</Link></dd>
            <dt>Purchases / sales</dt><dd>{u.purchases} / {u.sales}</dd>
            <dt>Reports about them</dt><dd>{u.reports}</dd>
            <dt>Public profile</dt><dd><Link href={`/sellers/${u.id}`}>Open</Link></dd>
          </dl>
        </section>
        <section className="glass mod-card" aria-labelledby="manage">
          <h2 id="manage">Manage</h2>
          {self ? (
            <p className="hint">This is your account. Another admin has to change your role or status.</p>
          ) : canManage || canSuspend ? (
            <UserControls userId={u.id} role={u.role} suspended={!!u.suspended_at} canManage={canManage} canSuspend={canSuspend} />
          ) : (
            <p className="hint">Only admins can change staff accounts.</p>
          )}
        </section>
      </div>
      <section className="section" aria-labelledby="hist">
        <h2 id="hist">History</h2>
        {history.length ? (
          <div className="table-wrap glass">
            <table className="table">
              <thead><tr><th scope="col">When</th><th scope="col">By</th><th scope="col">Action</th><th scope="col">Note</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}><td>{fmtDate(h.created_at)}</td><td>{h.actor_name}</td><td>{h.action.replace(/_/g, " ")}</td><td>{h.note}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="hint">No staff actions on this account.</p>}
      </section>
    </>
  );
}
