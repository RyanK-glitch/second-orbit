"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/account/orders", label: "Purchases" },
  { href: "/account/sales", label: "Sales" },
  { href: "/account/listings", label: "My listings" },
  { href: "/account/saved", label: "Saved items" },
  { href: "/messages", label: "Messages" },
  { href: "/account/settings", label: "Settings" },
];

export function AccountNav() {
  const path = usePathname();
  return (
    <nav className="account-nav glass" aria-label="Account">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path === l.href || (l.href !== "/messages" && path.startsWith(l.href + "/")) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
