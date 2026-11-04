import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/brand";

/** Shell for help and policy pages. The notice matters: this is sample text, not a real company's terms. */
export function LegalPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <article className="prose">
      <div className="page-head">
        <h1>{title}</h1>
        {intro && <p>{intro}</p>}
      </div>
      <div className="alert alert-info">
        <p>{APP_NAME} is a portfolio project, not a registered business. This is sample text showing what the page would cover. It isn&apos;t legal advice, and no real money or goods change hands.</p>
      </div>
      {children}
    </article>
  );
}
