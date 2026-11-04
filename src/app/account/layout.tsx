import type { Metadata } from "next";
import { AccountNav } from "@/components/AccountNav";
import { requirePageUser } from "@/lib/auth/page";

export const metadata: Metadata = { robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  await requirePageUser("/account/orders");
  return (
    <div className="account-layout">
      <AccountNav />
      <div>{children}</div>
    </div>
  );
}
