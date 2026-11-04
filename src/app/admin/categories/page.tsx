import type { Metadata } from "next";
import { CategoryEditor, NewCategoryForm } from "@/components/admin/AdminActions";
import { listCategories } from "@/lib/admin";
import { requirePagePermission } from "@/lib/auth/page";

export const metadata: Metadata = { title: "Categories", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminCategories() {
  await requirePagePermission("categories.manage", "/admin/categories");
  const categories = await listCategories();
  return (
    <>
      <div className="page-head">
        <span className="eyebrow">Back office</span>
        <h1>Categories</h1>
        <p>Shown in the shop filters and on the home page, in sort order. A category can only be deleted once it has no listings.</p>
      </div>
      <section aria-labelledby="existing">
        <h2 id="existing" className="visually-hidden">Existing categories</h2>
        {categories.map((c) => (
          <CategoryEditor key={c.id} category={{ id: c.id, name: c.name, blurb: c.blurb, sort: c.sort, listings: c.listings }} />
        ))}
      </section>
      <section className="section glass mod-card" aria-labelledby="new-cat">
        <h2 id="new-cat">New category</h2>
        <NewCategoryForm />
      </section>
    </>
  );
}
