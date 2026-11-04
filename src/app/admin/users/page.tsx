import type { Metadata } from "next";
import Link from "next/link";
import { Pager, SortTh, Toolbar } from "@/components/admin/Table";
import { fmtDate } from "@/components/bits";
import { listUsers, tableParams, USER_SORTS } from "@/lib/admin";
import { requirePagePermission } from "@/lib/auth/page";

export const metadata: Metadata = { title: "Users", robots: { index: false } };
export const dynamic = "force-dynamic";


const ROLE_LABEL: Record<string, string> = { user: "Member", moderator: "Moderator", admin: "Admin" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AdminUsers({ searchParams }: Props) {
  await requirePagePermission("admin.view", "/admin/users");
  const params = tableParams(await searchParams, USER_SORTS, { sort: "created_at", dir: "desc" });
  const { rows, total } = await listUsers(params);
  const base = { path: "/admin/users", params };
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Back office</span>
        <h1>Users</h1>
        <p>{total} account{total === 1 ? "" : "s"} match.</p>
      </div>
      <Toolbar {...base} placeholder="Search name or email" filters={[
        { value: "", label: "All roles" }, { value: "user", label: "Members" }, { value: "moderator", label: "Moderators" },
        { value: "admin", label: "Admins" }, { value: "suspended", label: "Disabled" },
      ]} />
      <div className="table-wrap glass">
        <table className="table">
          <caption className="visually-hidden">Users, sortable</caption>
          <thead>
            <tr>
              <SortTh {...base} column="display_name" label="Name" />
              <SortTh {...base} column="email" label="Email" />
              <SortTh {...base} column="role" label="Role" />
              <th scope="col">Status</th>
              <SortTh {...base} column="listings" label="Listings" />
              <SortTh {...base} column="orders" label="Purchases" />
              <SortTh {...base} column="created_at" label="Joined" />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/admin/users/${u.id}`}>{u.display_name}</Link></td>
                <td className="cell-wrap">{u.email}{u.providers.length > 0 && <span className="hint"> · {u.providers.join(", ")}</span>}</td>
                <td>{ROLE_LABEL[u.role]}</td>
                <td>{u.suspended_at ? <span className="status status-disputed">Disabled</span> : <span className="status status-completed">Active</span>}</td>
                <td>{u.listings}</td>
                <td>{u.orders}</td>
                <td>{fmtDate(u.created_at)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="hint">No users match.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pager {...base} total={total} />
    </>
  );
}
