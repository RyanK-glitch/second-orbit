import type { Metadata } from "next";
import Link from "next/link";
import { Pager, SortTh, Toolbar } from "@/components/admin/Table";
import { fmtDate } from "@/components/bits";
import { listAudit, tableParams } from "@/lib/admin";
import { requirePagePermission } from "@/lib/auth/page";

export const metadata: Metadata = { title: "Audit log", robots: { index: false } };
export const dynamic = "force-dynamic";

const TARGET_HREF: Record<string, (id: string) => string> = {
  user: (id) => `/admin/users/${id}`,
  listing: (id) => `/admin/listings/${id}`,
  category: () => "/admin/categories",
};

function Details({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details ?? {});
  if (!entries.length) return null;
  return (
    <ul className="audit-details">
      {entries.map(([k, v]) => {
        const change = v && typeof v === "object" && "to" in v ? (v as { from: unknown; to: unknown }) : null;
        return <li key={k}><code>{k}</code>: {change ? `${JSON.stringify(change.from)} → ${JSON.stringify(change.to)}` : JSON.stringify(v)}</li>;
      })}
    </ul>
  );
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminAudit({ searchParams }: Props) {
  await requirePagePermission("admin.view", "/admin/audit");
  const params = tableParams(await searchParams, ["created_at"] as const, { sort: "created_at", dir: "desc" });
  const { rows, total, actions } = await listAudit(params);
  const base = { path: "/admin/audit", params };
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Back office</span>
        <h1>Audit log</h1>
        <p>Every staff action and account-security event. Entries can&apos;t be edited or deleted from the app.</p>
      </div>
      <Toolbar {...base} placeholder="Search note, staff member or target id"
        filters={[{ value: "", label: "All actions" }, ...actions.map((a) => ({ value: a, label: a.replace(/_/g, " ") }))]} />
      <div className="table-wrap glass">
        <table className="table">
          <caption className="visually-hidden">Audit log</caption>
          <thead>
            <tr>
              <SortTh {...base} column="created_at" label="When" />
              <th scope="col">Who</th>
              <th scope="col">Action</th>
              <th scope="col">Target</th>
              <th scope="col">Note and changes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td>{fmtDate(a.created_at)}</td>
                <td>{a.actor_name}</td>
                <td>{a.action.replace(/_/g, " ")}</td>
                <td>{TARGET_HREF[a.target_type] ? <Link href={TARGET_HREF[a.target_type](a.target_id)}>{a.target_type}</Link> : a.target_type}</td>
                <td className="cell-wrap">{a.note}<Details details={a.details} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="hint">No entries match.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager {...base} total={total} />
    </>
  );
}
