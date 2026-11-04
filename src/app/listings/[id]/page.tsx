import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, GradeBadge, initials, PriceLine, Stars, timeAgo } from "@/components/bits";
import { Gallery } from "@/components/Gallery";
import { AlertIcon, BadgeIcon, ShieldIcon } from "@/components/icons";
import { ListingActions } from "@/components/ListingActions";
import { ListingGrid } from "@/components/ListingCard";
import { ReportButton } from "@/components/ReportButton";
import { getCurrentUser } from "@/lib/auth/session";
import { GRADES } from "@/lib/catalog";
import { config } from "@/lib/env";
import { isUuid } from "@/lib/http";
import { getListing, isSaved, similarListings } from "@/lib/listings";
import { formatCents } from "@/lib/money";
import { wearList } from "@/lib/sanitize";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  if (!isUuid(id)) return null;
  const user = await getCurrentUser();
  return getListing(id, user?.id);
}

const abs = (u: string) => (u.startsWith("http") ? u : `${config.appUrl}${u}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = await load((await params).id);
  if (!l) return { title: "Listing not found", robots: { index: false } };
  const desc = `${GRADES[l.condition].label} condition · ${formatCents(l.priceCents)} (was ${formatCents(l.originalPriceCents)} new). ${l.description}`.slice(0, 160);
  return {
    title: l.title,
    description: desc,
    alternates: { canonical: `/listings/${l.id}` },
    openGraph: {
      title: l.title,
      description: desc,
      type: "website",
      images: l.images[0] ? [{ url: abs(l.images[0].url), width: l.images[0].width, height: l.images[0].height, alt: l.images[0].alt }] : [],
    },
    robots: l.status === "removed" ? { index: false } : undefined,
  };
}

export default async function ListingPage({ params }: Props) {
  const { id } = await params;
  const l = await load(id);
  if (!l) notFound();
  const user = await getCurrentUser();
  const isOwner = user?.id === l.sellerId;
  const [similar, saved] = await Promise.all([
    similarListings(l.id, l.categoryId),
    user ? isSaved(user.id, l.id) : Promise.resolve(false),
  ]);
  const wear = wearList(l.wearNotes);
  const credits = [...new Map(l.images.filter((i) => i.credit).map((i) => [i.credit!.sourceUrl, i.credit!])).values()];
  const grade = GRADES[l.condition];

  // Structured data for rich results. Escape "<" so listing text can't close the script tag.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: l.title,
    description: l.description,
    ...(l.brand ? { brand: { "@type": "Brand", name: l.brand } } : {}),
    category: l.categoryName,
    image: l.images.map((i) => abs(i.url)),
    sku: l.id,
    offers: {
      "@type": "Offer",
      url: `${config.appUrl}/listings/${l.id}`,
      priceCurrency: "USD",
      price: (l.priceCents / 100).toFixed(2),
      itemCondition: "https://schema.org/UsedCondition",
      availability: l.available ? "https://schema.org/InStock" : "https://schema.org/SoldOut",
      seller: { "@type": "Person", name: l.seller.displayName },
      ...(l.pickupOnly
        ? { availableDeliveryMethod: "https://schema.org/OnSitePickup" }
        : {
            shippingDetails: {
              "@type": "OfferShippingDetails",
              shippingRate: { "@type": "MonetaryAmount", value: (l.shippingCents / 100).toFixed(2), currency: "USD" },
              shippingDestination: { "@type": "DefinedRegion", addressCountry: "US" },
            },
          }),
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: l.categoryName, href: `/shop?cat=${l.categoryId}` }, { label: l.title }]} />
      {l.status === "removed" && isOwner && (
        <div className="alert alert-warn"><p>This listing has been removed and is only visible to you.</p></div>
      )}
      <div className="pdp">
        <div>
          <Gallery images={l.images} />
          {credits.length > 0 && (
            <p className="credits">
              Photos:{" "}
              {credits.map((c, i) => (
                <span key={c.sourceUrl}>
                  {i > 0 && "; "}
                  <a href={c.sourceUrl} rel="noopener noreferrer nofollow" target="_blank">“{c.title}”</a>{c.creator ? ` by ${c.creator}` : ""},{" "}
                  <a href={c.licenseUrl} rel="noopener noreferrer nofollow license" target="_blank">{c.license}</a>
                </span>
              ))}
              . {credits.some((c) => c.changes.includes("cropped")) ? "Resized; close-up cropped." : "Resized."} Representative photos for this demo listing.
            </p>
          )}
        </div>
        <div className="pdp-info">
          <h1>{l.title}</h1>
          <div className="pdp-sub">
            <GradeBadge condition={l.condition} />
            {l.brand && <span>{l.brand}</span>}
            <span aria-hidden="true">·</span>
            <span>Listed {timeAgo(l.createdAt)}</span>
            {!l.available && <span className="pill pill-sold">{l.status === "reserved" ? "Reserved" : "Sold"}</span>}
          </div>
          <div className="pdp-price">
            <PriceLine price={l.priceCents} original={l.originalPriceCents} long />
          </div>
          <p className="pdp-price-note">
            {l.originalPriceCents > l.priceCents && `Crossed-out price is the ${l.originalNote || "original retail price when new"}. `}
            {l.pickupOnly ? `Local pickup only, ${l.seller.location}.` : l.shippingCents ? `${formatCents(l.shippingCents, true)} shipping.` : "Free shipping."}
            {" "}Buyer protection fee added at checkout.
          </p>

          <ListingActions listingId={l.id} available={l.available} isOwner={isOwner} signedIn={!!user} saved={saved} sellerName={l.seller.displayName} />
          <div className="notice notice-accent" style={{ marginBottom: 16 }}>
            <ShieldIcon />
            <p>
              <strong>Escrow buyer protection.</strong> Your payment is held until you confirm the item matches this listing. If it doesn&apos;t, open a dispute and get a refund.
            </p>
          </div>

          <div className="info-box glass">
            <h2>Condition: {grade.label}</h2>
            <div className="meter" role="img" aria-label={`Condition ${grade.rank} out of 4`}>
              {[1, 2, 3, 4].map((n) => <i key={n} className={n <= grade.rank ? "on" : ""} />)}
            </div>
            <p>{grade.summary} <Link href="/#grading">How we grade</Link></p>
          </div>
          <div className="info-box glass wear-box">
            <h2><AlertIcon /> Wear &amp; defects</h2>
            <ul>{wear.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
          <div className="info-box glass">
            <h2>Description</h2>
            <p style={{ whiteSpace: "pre-line" }}>{l.description}</p>
          </div>
          <div className="info-box glass">
            <h2>Details</h2>
            <table className="specs">
              <tbody>
                <tr><th scope="row">Category</th><td>{l.categoryName}</td></tr>
                {Object.entries(l.specs).map(([k, v]) => (
                  <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="info-box glass">
            <h2 className="visually-hidden">Seller</h2>
            <div className="seller">
              <div className="avatar" aria-hidden="true">{initials(l.seller.displayName)}</div>
              <div>
                <div className="seller-name">
                  <Link href={`/sellers/${l.seller.id}`}>{l.seller.displayName}</Link>
                  {l.seller.verified && <span className="verified"><BadgeIcon /> ID verified</span>}
                </div>
                <div className="seller-meta">
                  {l.seller.rating != null ? (
                    <><Stars rating={l.seller.rating} /> {l.seller.rating.toFixed(1)} · {l.seller.reviewCount} review{l.seller.reviewCount === 1 ? "" : "s"}</>
                  ) : "No reviews yet"}
                  {l.seller.location && ` · ${l.seller.location}`}
                </div>
              </div>
            </div>
            <div className="seller-stats">
              <div><strong>{l.seller.sales}</strong>completed sales</div>
              <div><strong>{new Date(l.seller.memberSince).getFullYear()}</strong>member since</div>
              <div><strong>{l.seller.reviewCount}</strong>verified reviews</div>
            </div>
          </div>
          {!isOwner && (
            <div style={{ marginTop: 12 }}>
              <ReportButton targetType="listing" targetId={l.id} label="Report this listing" />
            </div>
          )}
        </div>
      </div>
      {similar.length > 0 && (
        <section className="section" aria-labelledby="similar-title">
          <div className="section-head">
            <h2 id="similar-title">More in {l.categoryName}</h2>
            <Link href={`/shop?cat=${l.categoryId}`}>View all →</Link>
          </div>
          <ListingGrid items={similar} />
        </section>
      )}
    </>
  );
}
