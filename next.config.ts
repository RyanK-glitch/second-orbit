import type { NextConfig } from "next";

const plausibleHost = process.env.NEXT_PUBLIC_PLAUSIBLE_HOST || "https://plausible.io";

// Stripe Checkout, Connect onboarding and Identity are all Stripe-hosted
// redirects, so no Stripe script or iframe ever runs on our origin.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""} ${plausibleHost}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${process.env.MEDIA_PUBLIC_URL?.startsWith("http") ? new URL(process.env.MEDIA_PUBLIC_URL).origin : ""}`.trim(),
  "font-src 'self'",
  `connect-src 'self' ${plausibleHost}`,
  "frame-ancestors 'none'",
  // Social sign-in starts with a same-origin form POST that redirects to the provider; CSP checks those redirects too.
  "form-action 'self' https://checkout.stripe.com https://connect.stripe.com https://verify.stripe.com https://accounts.google.com https://appleid.apple.com https://www.facebook.com",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["sharp", "postgres"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
