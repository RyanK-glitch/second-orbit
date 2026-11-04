import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/bits";
import { SellerOnboarding } from "@/components/SellerOnboarding";
import { SellForm } from "@/components/SellForm";
import { requirePageUser } from "@/lib/auth/page";
import { canSell } from "@/lib/auth/session";
import { getCategories } from "@/lib/listings";

export const metadata: Metadata = { title: "Sell an item", description: "List a pre-owned item in minutes. Escrow protects every sale." };
export const dynamic = "force-dynamic";

export default async function SellPage() {
  const user = await requirePageUser("/sell");
  const categories = await getCategories();
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Sell an item" }]} />
      <div className="page-head">
        <h1>Sell an item</h1>
        <p>Honest listings sell faster. Describe the condition clearly and show the wear up close.</p>
      </div>
      {canSell(user) ? (
        <div className="sell-layout">
          <SellForm categories={categories} />
          <aside className="preview-wrap" aria-labelledby="tips-title">
            <div className="info-box glass">
              <h2 id="tips-title">Tips for a quick sale</h2>
              <ul>
                <li>Price at 40–70% of the new price for Good–Excellent items.</li>
                <li>Shoot in daylight against a plain background.</li>
                <li>Take a sharp close-up of every scratch, scuff or defect you list.</li>
                <li>Mention battery health, size or dimensions where relevant.</li>
              </ul>
            </div>
            <div className="info-box glass">
              <h2>How you get paid</h2>
              <p>The buyer pays into escrow. You ship (or meet for pickup), they confirm, and the money goes to your connected account.</p>
            </div>
          </aside>
        </div>
      ) : (
        <SellerOnboarding verification={user.verificationStatus} payoutsEnabled={user.payoutsEnabled} />
      )}
    </>
  );
}
