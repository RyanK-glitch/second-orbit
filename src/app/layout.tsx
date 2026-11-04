import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";
import Link from "next/link";
import Script from "next/script";
import { CartProvider } from "@/components/Cart";
import { Header } from "@/components/Header";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { config, integrations } from "@/lib/env";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-manrope", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-mono-jb", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(config.appUrl),
  title: { default: `${APP_NAME}: pre-owned marketplace`, template: `%s · ${APP_NAME}` },
  description: "Buy and sell pre-owned electronics, fashion, furniture and books. Every item is condition-graded, and every payment is held in escrow until delivery.",
  openGraph: { siteName: APP_NAME, type: "website" },
  icons: {
    icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g'%3E%3Cstop offset='0' stop-color='%235ef2ff'/%3E%3Cstop offset='1' stop-color='%23ff6ad5'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='12' fill='none' stroke='url(%23g)' stroke-width='5'/%3E%3C/svg%3E",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0e1a" },
  ],
  colorScheme: "light dark",
};

// Runs during parsing, before first paint, so dark-mode visitors never see a flash of the light theme.
const THEME_SCRIPT = `(function(){var t;try{t=localStorage.getItem("theme")}catch(e){}if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = integrations();
  const simulated = [mode.payments === "mock" && "payments", mode.shipping === "mock" && "shipping", mode.identity === "mock" && "ID checks", mode.email === "mock" && "email"].filter(Boolean);
  return (
    // suppressHydrationWarning: the script above sets data-theme before React hydrates.
    <html lang="en" className={`${manrope.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="mock-banner" role="note">
          Test mode: no real money moves.
          {simulated.length > 0 && ` Simulated locally: ${simulated.join(", ")}.`}
        </div>
        <CartProvider>
          <Header />
          <main id="main" tabIndex={-1}>
            <div className="container">{children}</div>
          </main>
        </CartProvider>
        <footer className="site-footer">
          <div className="container footer-inner">
            <div className="footer-note">
              <p>
                <strong>{APP_NAME}</strong>: {APP_TAGLINE.toLowerCase()}. Payments are held until you confirm delivery.
              </p>
              <p>A portfolio project, not a real shop: no real money or goods change hands.</p>
            </div>
            <nav aria-label="Footer">
              <ul>
                <li><Link href="/shop">Shop all</Link></li>
                <li><Link href="/sell">Sell an item</Link></li>
                <li><Link href="/#grading">How grading works</Link></li>
                <li><Link href="/buyer-protection">Buyer protection</Link></li>
                <li><Link href="/fees">Fees</Link></li>
                <li><Link href="/help">Help</Link></li>
                <li><Link href="/contact">Contact</Link></li>
              </ul>
              <ul className="footer-legal">
                <li><Link href="/terms">Terms</Link></li>
                <li><Link href="/privacy">Privacy</Link></li>
                <li><Link href="/cookies">Cookies</Link></li>
                <li><Link href="/seller-agreement">Seller agreement</Link></li>
                <li><Link href="/prohibited-items">Prohibited items</Link></li>
              </ul>
            </nav>
          </div>
          <p className="footer-credit">Designed and developed by <span className="footer-credit-name">Ryan Kekulthotuwage</span></p>
        </footer>
        {config.plausibleDomain && (
          // Plausible is cookieless and stores no personal data.
          <Script
            defer
            data-domain={config.plausibleDomain}
            src={`${config.plausibleHost}/js/script.js`}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
