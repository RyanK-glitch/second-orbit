import Link from "next/link";
import { GradeBadge } from "@/components/bits";
import { GradeIcon, ShieldIcon, UserIcon } from "@/components/icons";
import { ListingGrid } from "@/components/ListingCard";
import { OrbitCarousel } from "@/components/OrbitCarousel";
import { CONDITIONS, GRADES } from "@/lib/catalog";
import { featuredListings, getCategories, recentListings } from "@/lib/listings";
import { formatCents, savingsPct } from "@/lib/money";
import { SHAPES } from "@/lib/placeholder-art";

export const dynamic = "force-dynamic";

const CATEGORY_ICON: Record<string, string> = {
  electronics: "laptop", fashion: "jacket", furniture: "chair", books: "books", home: "coffee", hobby: "bike",
};

function CategoryIcon({ id }: { id: string }) {
  const body = (SHAPES[CATEGORY_ICON[id]] ?? SHAPES.book).replace(/class="f"/g, "");
  return (
    <svg width="36" height="36" viewBox="20 20 160 160" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: body }} />
  );
}

export default async function Home() {
  const [featured, recent, categories] = await Promise.all([featuredListings(8), recentListings(8), getCategories()]);
  const live = categories.reduce((n, c) => n + c.count, 0);
  const avgSave = recent.length ? Math.round(recent.reduce((s, l) => s + savingsPct(l.priceCents, l.originalPriceCents), 0) / recent.length) : 0;
  // Up to seven featured listings ride the hero orbit (the same items appear in "Featured finds" below).
  const orbit = featured.slice(0, 7);

  return (
    <>
      <section className="hero glass" aria-labelledby="hero-title">
        <div>
          <span className="eyebrow">Pre-owned · condition-graded · escrow-protected</span>
          <h1 id="hero-title">
            Pre-loved, <span className="holo-text">verified</span>, delivered.
          </h1>
          <p className="hero-lead">
            Every item is condition-graded with real close-ups of wear, sold by an ID-verified seller. Your payment is held in escrow until it arrives as described.
          </p>
          <form className="hero-search" role="search" action="/shop">
            <label htmlFor="hero-q" className="visually-hidden">
              Search listings
            </label>
            <input id="hero-q" name="q" type="search" placeholder="What are you looking for?" autoComplete="off" />
            <button className="btn btn-primary btn-lg" type="submit">
              Search
            </button>
          </form>
          <nav className="hero-chips" aria-label="Popular searches">
            {["iPhone", "Camera", "Jacket", "Sneakers", "Espresso", "Guitar"].map((q) => (
              <Link key={q} href={`/shop?q=${encodeURIComponent(q)}`}>{q}</Link>
            ))}
          </nav>
          <ul className="hero-trust">
            <li><strong>{live}</strong> items live</li>
            <li><strong>{avgSave}%</strong> average saving</li>
            <li><strong>48h</strong> inspection window</li>
          </ul>
        </div>
        <OrbitCarousel items={orbit.filter((l) => l.image).map((l) => ({ id: l.id, image: l.image!.thumbUrl, price: formatCents(l.priceCents) }))} />
      </section>

      <section className="section reveal" aria-labelledby="cats-title">
        <div className="section-head">
          <h2 id="cats-title">Browse by category</h2>
          <Link href="/shop">View all items →</Link>
        </div>
        <div className="cat-grid">
          {categories.map((c) => (
            <Link key={c.id} className="cat-tile glass" href={`/shop?cat=${c.id}`}>
              <CategoryIcon id={c.id} />
              <strong>{c.name}</strong>
              <span>
                {c.count} items · {c.blurb}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="section reveal" aria-labelledby="feat-title">
        <div className="section-head">
          <h2 id="feat-title">Featured finds</h2>
          <Link href="/shop?sort=condition">Best condition →</Link>
        </div>
        {featured.length ? <ListingGrid items={featured} /> : <p className="empty glass">Featured items have all been snapped up. Check back soon.</p>}
      </section>

      <section className="section reveal" aria-labelledby="recent-title">
        <div className="section-head">
          <h2 id="recent-title">Recently listed</h2>
          <Link href="/shop?sort=newest">See everything new →</Link>
        </div>
        <ListingGrid items={recent} />
      </section>

      <section className="section reveal" id="protection" aria-labelledby="trust-title">
        <h2 id="trust-title" className="visually-hidden">
          Why shop here
        </h2>
        <div className="trust">
          <div className="trust-item glass">
            <GradeIcon />
            <div>
              <h3>Honest condition grades</h3>
              <p>Four clear grades, plus a required close-up photo of any wear and the seller&apos;s own defect notes.</p>
            </div>
          </div>
          <div className="trust-item glass">
            <ShieldIcon />
            <div>
              <h3>Escrow buyer protection</h3>
              <p>Your payment is held until you confirm the item matches the listing. If it doesn&apos;t, open a dispute and get a refund.</p>
            </div>
          </div>
          <div className="trust-item glass">
            <UserIcon />
            <div>
              <h3>ID-verified sellers</h3>
              <p>Every seller passes ID verification. Ratings come only from buyers who actually received their item.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section reveal" id="grading" aria-labelledby="grading-title">
        <div className="section-head">
          <h2 id="grading-title">How condition grading works</h2>
        </div>
        <div className="grade-guide">
          {CONDITIONS.map((k) => (
            <div className="glass" key={k}>
              <GradeBadge condition={k} />
              <p>{GRADES[k].summary}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
