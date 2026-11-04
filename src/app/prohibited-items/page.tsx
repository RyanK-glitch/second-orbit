import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Prohibited items" };

export default function ProhibitedItemsPage() {
  return (
    <LegalPage title="Prohibited items" intro="These can't be sold here. Listings that break the rules are removed, and repeat offenders are suspended.">
      <ul>
        <li>Counterfeit goods, replicas, or anything that infringes someone else&apos;s rights</li>
        <li>Stolen goods, or items you don&apos;t have the right to sell</li>
        <li>Weapons, ammunition and explosives</li>
        <li>Drugs, tobacco, alcohol and prescription medicines</li>
        <li>Recalled or unsafe products</li>
        <li>Hazardous materials</li>
        <li>Adult content</li>
        <li>Live animals</li>
        <li>Personal data, accounts, gift cards and cash equivalents</li>
      </ul>
      <p>See something that shouldn&apos;t be here? Use &ldquo;Report this listing&rdquo; on the listing page.</p>
    </LegalPage>
  );
}
