import type { Metadata } from "next";
import Link from "next/link";
import { BarList, ColumnChart, StatTile } from "@/components/admin/Charts";
import { overview } from "@/lib/admin";
import { requirePagePermission } from "@/lib/auth/page";
import { ORDER_STATUS_LABEL } from "@/lib/catalog";
import { formatCents } from "@/lib/money";

export const metadata: Metadata = { title: "Back office", robots: { index: false } };
export const dynamic = "force-dynamic";

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const usd = (cents: number) => (cents >= 100_000_00 ? `$${compact.format(cents / 100)}` : formatCents(cents));
const day = (d: Date) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

const RANGES = [7, 30, 90];

export default async function AdminOverview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePagePermission("admin.view", "/admin");
  const requested = Number((await searchParams).days);
  const days = RANGES.includes(requested) ? requested : 30;
  const { totals: t, daily, byCategory, byStatus } = await overview(days);
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Back office</span>
        <h1>Overview</h1>
        <p>Last {days} days unless noted.</p>
      </div>
      <nav className="admin-toolbar" aria-label="Time range">
        {RANGES.map((d) => (
          <Link key={d} className={`btn${d === days ? " btn-primary" : ""}`} href={`/admin?days=${d}`} aria-current={d === days ? "page" : undefined}>
            {d} days
          </Link>
        ))}
      </nav>

      <div className="stat-grid">
        <StatTile label="Gross sales" value={usd(t.gmv_cents)} sub={`${t.orders} paid orders`} />
        <StatTile label="Held in escrow" value={usd(t.escrow_cents)} sub="Right now" />
        <StatTile label="Fees earned" value={usd(t.fees_cents)} sub="Completed orders" />
        <StatTile label="Members" value={compact.format(t.users)} sub={`+${t.new_users} new · ${t.suspended_users} disabled`} />
        <StatTile label="Live listings" value={compact.format(t.active_listings)} sub={`${t.sold_listings} sold all-time`} />
        <Link href="/admin/moderation" className="stat glass stat-link">
          <span className="stat-label">Needs attention</span>
          <strong className="stat-value">{t.open_disputes + t.open_reports}</strong>
          <span className="hint">{t.open_disputes} disputes · {t.open_reports} reports →</span>
        </Link>
      </div>

      <div className="chart-grid">
        <section className="glass chart-card" aria-labelledby="gmv-title">
          <h2 id="gmv-title">Gross sales per day</h2>
          <ColumnChart title="Gross sales per day" format={(n) => (n >= 100_000 ? `$${compact.format(n / 100)}` : `$${Math.round(n / 100)}`)}
            points={daily.map((d) => ({ label: day(d.day), value: d.gmvCents, display: formatCents(d.gmvCents) }))} />
        </section>
        <section className="glass chart-card" aria-labelledby="signup-title">
          <h2 id="signup-title">New members per day</h2>
          <ColumnChart title="New members per day" format={(n) => compact.format(n)}
            points={daily.map((d) => ({ label: day(d.day), value: d.signups, display: String(d.signups) }))} />
        </section>
        <section className="glass chart-card" aria-labelledby="cat-title">
          <h2 id="cat-title">Live listings by category</h2>
          <BarList title="Live listings by category" points={byCategory.map((c) => ({ ...c, display: String(c.value) }))} />
        </section>
        <section className="glass chart-card" aria-labelledby="status-title">
          <h2 id="status-title">Orders by status (all time)</h2>
          {byStatus.length ? (
            <BarList title="Orders by status" points={byStatus.map((s) => ({ label: ORDER_STATUS_LABEL[s.label]?.split(":")[0] ?? s.label, value: s.value, display: String(s.value) }))} />
          ) : <p className="hint">No orders yet.</p>}
        </section>
      </div>
    </>
  );
}
