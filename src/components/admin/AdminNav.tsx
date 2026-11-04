"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminLink = { href: string; label: string; badge?: number };

export function AdminNav({ links }: { links: AdminLink[] }) {
  const path = usePathname();
  return (
    <nav className="account-nav glass" aria-label="Back office">
      {links.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href || (l.href !== "/admin" && path.startsWith(l.href + "/")) ? "page" : undefined}>
          {l.label}
          {l.badge ? <span className="nav-badge" aria-label={`${l.badge} open`}>{l.badge}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
