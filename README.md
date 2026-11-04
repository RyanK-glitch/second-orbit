# Second Orbit: pre-owned marketplace

A production-style marketplace for reselling second-hand goods: a futuristic, accessible storefront plus the backend, accounts, escrow payments, trust & safety, shipping and quality tooling around it.

**Developer:** Ryan Kekulthotuwage

> **A portfolio project, in test mode only.** It isn't a real shop, and no real money or goods change hands. Every integration runs on a local mock by default, and the real adapters accept only test-mode keys. The Stripe adapter refuses `sk_live_` keys. No card data ever touches this app.

## Highlights

- **Marketplace:** graded listings, full-text search, cart, checkout, messaging, reviews and a back office with an audit log.
- **Payments:** per-seller escrow on Stripe Connect, with disputes, refunds, automatic release and card chargeback handling.
- **Accounts:** password and social sign-in, password reset, email verification and two-factor sign-in (TOTP).
- **Privacy:** data export and account deletion that keeps the financial records.
- **Email:** a transactional outbox with retries and a local test inbox.
- **Dark mode:** follows the system setting, with a header toggle that remembers your choice and no flash on load.
- **Runs with no accounts:** every provider has a local mock, so the whole site works offline.
- **Tested:** 88 unit tests and 65 browser tests, including WCAG 2.1 AA accessibility scans.

---

## Quick start

**One command (Docker only, no Node needed):**

```bash
docker compose up --build
```

Open http://localhost:3000. Postgres starts, migrations run, demo data is seeded and the app starts. Everything runs on mocks.

**Local development (Node 22.12+ and Docker for Postgres):**

```bash
npm install
npm run dev:all      # starts Postgres → migrates → seeds if empty → next dev
```

### Demo accounts

All demo accounts use the password `demo-password-1`.

| Role | Email |
| --- | --- |
| Buyer | `buyer@example.com` |
| Sellers | `maya@example.com`, `jonas@example.com`, `priya@example.com`, `leo@example.com`, `sofia@example.com`, `carlos@example.com`, `hana@example.com`, `ben@example.com` |
| Moderator | `mod@example.com` (back office at `/admin`: moderation queue, read-only tables, disable member accounts) |
| Admin | `admin@example.com` (everything a moderator can do, plus roles, staff accounts, listing edits and categories) |

You can also sign up as a new user. The sell flow walks you through ID verification and payout setup (both mocked unless you add keys).

If you use the Docker command, set `STAFF_2FA_OPTIONAL=1` in `.env` first if you want the moderator and admin accounts to reach `/admin` straight away. Without it they're sent to set up two-factor sign-in, which also works if you have an authenticator app. Local development copies this setting from `.env.example`.

### Things to try

- **Password reset:** use *Forgot your password?* on the sign-in page, then open the link from the test inbox at http://localhost:3000/mock/inbox.
- **Two-factor sign-in:** turn it on in **Settings** with any authenticator app. The account needs a code from then on, so a throwaway sign-up is a better choice than a demo account.
- **A full order:** buy as `buyer@example.com`, then sign in as the seller to create a label and simulate tracking. Every step appears in the test inbox.
- **A chargeback:** click *Simulate card chargeback (test)* on an order, then decide it as a moderator at `/admin/chargebacks`.
- **Your data:** download it or delete the account from **Settings**.

---

## Stack and choices

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | **Next.js 16 (App Router), React 19, TypeScript** | Server-rendered product pages for SEO. Route handlers serve as the API. |
| Database | **Postgres 18** with **postgres.js** (SQL-first, no ORM) | Full-text search, generated `tsvector`, row locks for escrow. Tagged templates always bind parameters. |
| Migrations | Plain SQL in `db/migrations`, tiny runner (`scripts/migrate.ts`) | No extra tooling, and the SQL is easy to review. |
| Auth | **Built in**: scrypt password hashes (`node:crypto`), opaque session tokens stored as SHA-256 in Postgres, httpOnly SameSite=Lax cookie | No auth dependency. Sessions can be revoked (suspension kills all of a user's sessions). |
| Social sign-in | **Built in** OAuth 2 / OpenID Connect for Google, Apple and Facebook (`src/lib/auth/oauth/`): PKCE, browser-bound single-use state, nonce, RS256 ID-token checks against each provider's JWKS, Apple's ES256 client secret, all on `node:crypto` | Still no auth dependency. |
| Validation | **zod** | Every API input is parsed, and errors come back as per-field messages. |
| Styling | Plain CSS design system (`src/app/globals.css`), `next/font` (Manrope) | "Aurora": light and dark themes from one set of colour tokens, photo-first, iridescent accents, WCAG AA contrast, no CSS framework. |
| Images | **sharp** | Decode, quality-score and re-encode untrusted uploads. |
| Tests | **Vitest** (unit), **Playwright** + **@axe-core/playwright** (E2E + accessibility) | |

Runtime dependencies: `next`, `react`, `react-dom`, `postgres`, `zod`, `sharp`, `stripe`, `@easypost/api`, `@aws-sdk/client-s3`, `tsx` (runs scripts in Docker), `qrcode` (two-factor setup).

### Third-party providers (each behind an adapter in `src/lib/integrations/`)

| Integration | Provider | Real adapter | Local mock |
| --- | --- | --- | --- |
| Payments / escrow | **Stripe Connect**, separate charges & transfers | `payments/stripe.ts` (Checkout Sessions, Express-style connected accounts, transfers, refunds, transfer reversals) | `/mock/stripe/checkout/:id` page simulates hosted Checkout (no card fields) |
| ID verification | **Stripe Identity** | `identity.ts` (hosted document + selfie) | `/mock/identity/:id`: simulate pass or fail |
| Shipping | **EasyPost** | `shipping.ts` (rate shopping, label purchase, HMAC-verified tracker webhooks) | Instant label, printable test label, a "Simulate carrier update" button |
| Storage / CDN | **Any S3-compatible bucket** (AWS S3, Cloudflare R2, RustFS) | `storage.ts` with `@aws-sdk/client-s3` | Local disk under `.data/media`, served at `/media/<key>` |
| Email | **Resend** | `email.ts` (plain `fetch` to the HTTP API, with an idempotency key) | Stored in the outbox and shown at `/mock/inbox`, on localhost only |
| Analytics | **Social sign-in (Google, Apple, Facebook)**

Each button appears on the sign-in and sign-up pages once its keys are set. Every provider must have this redirect URI registered exactly: `${APP_URL}/api/auth/oauth/<google|apple|facebook>/callback`.

1. **Google**: Google Cloud console → *APIs & Services* → *OAuth consent screen* (add the `openid`, `email` and `profile` scopes), then *Credentials* → *Create credentials* → *OAuth client ID* → *Web application*. Add the redirect URI and copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. `http://localhost:3000` works while the app is in testing.
2. **Apple** (needs a paid Apple Developer account): *Certificates, IDs & Profiles* →
   - *Identifiers* → an App ID with **Sign in with Apple** enabled;
   - *Identifiers* → a **Services ID** (this is `APPLE_CLIENT_ID`), enable Sign in with Apple, and add your domain and the return URL. Apple only accepts HTTPS and no `localhost`, so use a tunnel (`cloudflared`, `ngrok`) and set `APP_URL` to it;
   - *Keys* → a key with Sign in with Apple → download the `.p8` once (`APPLE_PRIVATE_KEY`, its Key ID is `APPLE_KEY_ID`). `APPLE_TEAM_ID` is shown top right.
   The app signs a fresh short-lived client secret from the key for each sign-in, so nothing expires.
3. **Facebook**: Meta for Developers → *Create app* → add **Facebook Login** → *Settings* → add the redirect URI under *Valid OAuth Redirect URIs*. Copy the App ID and secret from *App settings → Basic*. While the app is in development mode, only people with a role on the app can sign in.

How accounts are matched:

- A returning person is found by the provider's stable account id, never by email.
- A new social identity is **linked to an existing account by email only when Google or Apple says the email is verified**. Linking marks the email verified, signs out every existing session for that account (so anyone who registered the address without owning it loses access), and is written to the audit log. Facebook doesn't assert verification, so it never auto-links; moderator and admin accounts never auto-link either. In those cases the person signs in with their password and connects the provider from **Settings → Connected accounts**.
- **Apple**: relay addresses (ending in `@privaterelay.appleid.com`) are stored as the account email and are deliverable, but are never used to match an existing account. Apple sends the person's name only the first time they approve the app, so it is captured then; later sign-ins may not include an email at all and still work via the Apple account id.
- Social-only accounts have no password, so they can't disconnect their last provider.
- Cancelled or failed sign-ins return to the sign-in page with a plain message. The state is single use, expires after 10 minutes and must come back to the same browser that started it.

**Plausible** (cookieless) | Client script + server events via Plausible's Events API (Plausible has no official Node SDK) | Aggregate events stored in the `analytics_events` table |

`GET /api/health` reports which adapter each integration is using.

---

## Architecture

```
src/
  app/                    Pages (server components) + API route handlers
    api/                  JSON API: every mutation is origin-checked, zod-validated and authorised
    listings/[id]         SSR product page: metadata, OpenGraph, Product JSON-LD
    sitemap.ts, robots.ts SEO
    mock/                 Stand-ins for Stripe / Identity / carrier hosted pages, plus the test inbox
    terms, privacy, help  Help, policy and contact pages
  components/             UI (client components only where interaction needs it)
  lib/
    escrow.ts             Pure order state machine (unit tested)
    orders.ts             Checkout, fulfilment, release, refunds, disputes, reviews
    listings.ts           Catalogue queries + Postgres full-text search
    listing-service.ts    Listing CRUD, uploads, saved items
    images.ts             Upload validation + quality checks + re-encoding
    moderation.ts         Reports, moderation queue, audit log
    messaging.ts          Buyer–seller conversations
    chargebacks.ts        Card chargebacks: freeze, evidence, won and lost outcomes
    account.ts            Data export and account deletion
    email.ts              Transactional outbox; email-templates.ts holds the text
    auth/                 Sessions, passwords, emailed tokens, TOTP two-factor, OAuth
    integrations/         Adapters (real SDK + mock) for every provider
db/migrations/            SQL schema
scripts/                  migrate / seed / reset / dev-all
tests/unit, tests/e2e     Vitest + Playwright suites
```

### Escrow flow (Stripe Connect, separate charges and transfers)

1. **Checkout.** Items are reserved (row-locked) for 35 minutes. One order (one escrow) is created per seller and delivery method, then the buyer is redirected to the Stripe-hosted Checkout page, which collects the shipping address. We never see the card.
2. **Paid.** Funds are held: the webhook `checkout.session.completed` (or the mock) marks the orders `paid` and the listings `sold`. The charge sits on the platform balance.
3. **Shipped.** The seller buys an EasyPost label. Tracker webhooks move the shipment to `delivered`. Pickup orders schedule a meetup instead (propose → accept → buyer confirms collection).
4. **Delivered.** The inspection window opens (48h by default). The buyer either confirms, which **transfers** the seller's share (items + shipping − 8% fee) to their connected account, or opens a **dispute**, which freezes the payout.
5. **Auto-release.** `POST /api/cron/release-funds` (bearer `CRON_SECRET`) releases escrow when the window lapses with no dispute. It also expires stale checkouts, purges unpublished uploads, reminds buyers that their inspection window is ending, retries unsent email and removes expired tokens. Schedule it every ~15 minutes.
6. **Disputes.** A moderator refunds the buyer (fully or partially) or releases the funds to the seller. If funds were already transferred, the transfer is reversed before the refund. Sellers can cancel and refund before shipping.

All Stripe calls use idempotency keys derived from the order id. Webhooks are signature-verified and de-duplicated in `webhook_events`.

### Trust & safety

- **Sellers** must pass ID verification and connect payouts before they can upload photos or publish listings.
- **Reviews** unlock only for the buyer of a `delivered`/`completed` order (one per order). Seller ratings are computed from those reviews.
- **Reports** can target listings, users or messages. Message reports are limited to conversation participants.
- **Moderation queue** at `/admin/moderation`: resolve disputes, remove listings, suspend accounts. Every action is written to `moderation_actions`.
- **Messaging safety:** messages that mention off-platform payment (Zelle, gift cards, wire transfers and similar) trigger a safety banner for the recipient.

### Photo quality pipeline

Each upload is decoded by sharp (anything that isn't a real JPEG, PNG, WebP or AVIF is rejected, and pixel count is capped), then scored on a normalised 640px greyscale copy:

| Check | Error (rejected) | Warning (accepted) |
| --- | --- | --- |
| Resolution | short side < 600px | < 1000px |
| Brightness (mean luma) | < 35 or > 240 | < 65 or > 220 |
| Contrast (luma stdev) | n/a | < 18 |
| Focus (Laplacian stdev) | < 6 | < 11 |

Accepted photos are re-encoded to WebP at 1600px plus a 600px thumbnail, which **strips EXIF/GPS**. Only the re-encoded files are stored. Every listing needs at least one photo marked **wear close-up**. Thresholds live in `src/lib/images.ts`.

### Back office (`/admin`)

Moderators and admins get a **Back office** link in the account menu.

| Page | Moderator | Admin |
| --- | --- | --- |
| Overview: sales, escrow held, fees, members, listings, open cases; daily charts (7/30/90 days) with table views | ✓ | ✓ |
| Moderation queue (reports, disputes) | ✓ | ✓ |
| Users: search, filter by role/disabled, sort, paginate; detail with sign-in methods and history | view, disable/enable **members**, sign out everywhere | also change roles and manage staff accounts |
| Listings: search, filter, sort, paginate | view, remove/restore | also edit title, price, category, featured |
| Orders: search, filter by status, sort, paginate | ✓ | ✓ |
| Categories: create, edit, delete (only when empty) | | ✓ |
| Audit log: every staff action and account-security event, filter by action | ✓ | ✓ |

Permissions live in one map (`src/lib/auth/permissions.ts`). Every admin page calls `requirePagePermission()` and every admin API route calls `requirePermission()` on the server; service functions re-check rules that depend on the target (members vs staff). Nobody can change their own role or status, and the last active admin can't be demoted or disabled. Every change requires a note and is written to the audit log with before/after values.

JSON endpoints: `GET /api/admin/{overview,users,listings,orders,audit,categories}` (with `?q=&filter=&sort=&dir=&page=`), `GET|PATCH /api/admin/users/:id`, `DELETE /api/admin/users/:id/sessions`, `PATCH /api/admin/listings/:id`, `POST /api/admin/categories`, `PATCH|DELETE /api/admin/categories/:id`.

### Accounts, email and privacy

- **Password reset:** single-use, one-hour tokens, stored only as hashes. The response is the same whether or not the address has an account. A reset signs out every device and doesn't start a session, so two-factor still applies.
- **Email verification:** new members get a confirmation link, behind a button because mail scanners open every link. Using a reset link also confirms the address.
- **Transactional email:** a transactional outbox (`email_outbox`). Emails are written in the same transaction as the change they describe, so a rolled-back order can't send one. They go out after the response, retry with backoff through the cron job, and carry an idempotency key. Bodies are cleared after a real send, because they can hold reset links. Text only, and message contents are never copied in. Without a `RESEND_API_KEY`, they appear at `/mock/inbox` (localhost only).
- **Two-factor sign-in:** TOTP (RFC 6238, checked against its test vectors) with 10 single-use recovery codes. Secrets are sealed with AES-256-GCM, a code can't be replayed, and each sign-in attempt allows five guesses. Social sign-in passes through the same challenge, so it isn't a way around the code. Members can opt in; staff can't reach the back office without it.
- **Data export:** Settings → *Download my data* gives a JSON file of what's held about the member, without secrets or other people's data, such as buyers' addresses in a seller's export.
- **Account deletion:** Settings → *Delete account*. Refused while an order is open, a chargeback is pending or the account is staff. The account is anonymised rather than removed, because orders must be kept for tax and the other party's history must still make sense: profile, sign-in methods, tokens and unsold listings with their photos go, messages are redacted, and reviews keep their rating without their text.

### Chargebacks

A chargeback is a buyer disputing a card payment with their bank, separately from an in-app dispute. Stripe's `charge.dispute.*` webhooks drive `src/lib/chargebacks.ts`, and handling is idempotent and safe if events arrive out of order.

- **Opened:** every order on the payment gets `payout_frozen_at`, because a charge can span several sellers. The freeze is checked inside `releaseFunds` and `refundOrder`, so no path can move the money. Sellers and admins are emailed.
- **Evidence:** `/admin/chargebacks` assembles tracking, delivery and messaging records and submits them to Stripe.
- **Won:** orders unfreeze and carry on where they were.
- **Lost:** orders become `refunded` without a refund call, since the bank already returned the money and another refund would pay the buyer twice. Sellers already paid have the transfer reversed, and if that fails the chargeback is flagged as a platform loss. Partial losses are split across orders in proportion to their totals.

With mocked payments, *Simulate card chargeback (test)* on an order and the bank-decision buttons on `/admin/chargebacks` call the same code.

### Security notes

- Every state-changing API route checks the `Origin` header (CSRF), requires a session where relevant, and enforces ownership or role inside the service function.
- All SQL uses bound parameters. User search text is reduced to letters and digits before it becomes a tsquery.
- Untrusted text is normalised (control, bidi-override and zero-width characters are removed) and rendered only as text. JSON-LD escapes `<`.
- Sign-in is rate-limited per IP and per email, with constant-time password checks and the same timing for unknown emails.
- The CSP and security headers are set in `next.config.ts`. Stripe pages are redirects, so no third-party scripts run on our origin apart from the optional Plausible script.
- `.env*` files are git-ignored. Only `.env.example` is committed.

---

## Environment variables

Copy `.env.example` to `.env`. Every variable is documented there.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://marketplace:marketplace@localhost:54320/marketplace` | Postgres from docker-compose |
| `APP_URL` | `http://localhost:3000` | Redirect URLs, canonical URLs, sitemap |
| `FORCE_MOCK_INTEGRATIONS` | `0` | `1` ignores all keys (the E2E suite uses this) |
| `CRON_SECRET` | empty | Bearer token for `/api/cron/release-funds` |
| `PLATFORM_FEE_BPS` / `BUYER_PROTECTION_BPS` / `INSPECTION_WINDOW_HOURS` | `800` / `300` / `48` | Marketplace economics |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | empty | Payments + Connect (+ Identity) |
| `IDENTITY_PROVIDER` | follows Stripe key | `mock` keeps ID checks mocked while using real Stripe payments |
| `EASYPOST_API_KEY`, `EASYPOST_WEBHOOK_SECRET` | empty | Labels + tracking |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`, `S3_CREATE_BUCKET` | empty | Media storage |
| `MEDIA_PUBLIC_URL` | `/media` or the bucket URL | CDN base URL for media |
| `MEDIA_DIR` | `.data/media` | Local-disk storage folder |
| `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `NEXT_PUBLIC_PLAUSIBLE_HOST` | empty / `https://plausible.io` | Analytics |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | empty | Sign in with Google |
| `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` | empty | Sign in with Apple |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_GRAPH_VERSION` | empty / `v23.0` | Facebook Login |
| `OAUTH_MOCK` | `0` | `1` swaps all three for a local simulator (e2e only; refused unless `APP_URL` is localhost) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | empty / sample addresses | Sends email through Resend; without a key, emails appear at `/mock/inbox` |
| `TWO_FACTOR_KEY` | empty | Encrypts TOTP secrets; required unless `APP_URL` is localhost |
| `STAFF_2FA_OPTIONAL` | `0` in code, `1` in `.env.example` | `1` lets the shared demo staff accounts into the back office without two-factor |

## Switching integrations from mock to test mode

Each integration switches on its own as soon as its keys are present. Restart the app after editing `.env`.

**Stripe Connect + Identity**
1. In a Stripe account in **test mode**, enable Connect. To use Identity, enable it too.
2. Set `STRIPE_SECRET_KEY` to your Stripe test key, which starts with `sk_test_`.
3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`, then set `STRIPE_WEBHOOK_SECRET` to the signing secret it prints, which starts with `whsec_`. Events used: `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`, `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `account.updated`, `identity.verification_session.verified`, `identity.verification_session.requires_input`.
4. Pay with Stripe test cards (e.g. `4242 4242 4242 4242`) on the Stripe-hosted page.
5. The seeded sellers have mock connected accounts, so to test real payouts, sign up a new seller and complete Connect onboarding with Stripe's test data.

**EasyPost**
1. Set `EASYPOST_API_KEY` to your EasyPost test key, which starts with `EZTK`. Test labels are free.
2. Sellers must add a ship-from address in **Settings** (US addresses).
3. Add a webhook in the EasyPost dashboard pointing to the `/api/webhooks/easypost` path on your public URL, with a secret, and set `EASYPOST_WEBHOOK_SECRET`. Use a tunnel (e.g. `cloudflared`, `ngrok`) locally. Test trackers progress to delivered on their own.

**S3-compatible storage**
- Local: `docker compose --profile s3 up -d s3` (RustFS), then
  `S3_BUCKET=second-orbit-media S3_ENDPOINT=http://localhost:9000 S3_ACCESS_KEY_ID=localdev S3_SECRET_ACCESS_KEY=localdev-secret S3_FORCE_PATH_STYLE=1 S3_CREATE_BUCKET=1`
  and re-seed with `npm run db:reset`.
- AWS S3 / R2: set the bucket, region, credentials (and endpoint for R2). Put a CDN in front and set `MEDIA_PUBLIC_URL` to its base URL. Keys are unique per upload and served with `immutable` caching.

**Plausible**
- Set `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` to the site's domain (and `NEXT_PUBLIC_PLAUSIBLE_HOST` if self-hosted). Events sent: `Purchase` (revenue band only), `Listing published`, `Order completed`, `Dispute opened`. No user ids, emails or IPs are sent.

---

## Tests

```bash
npm run typecheck     # tsc
npm test              # Vitest unit tests: escrow state machine, fees, sanitising, search query safety,
                      # image quality (blur/dark/small/EXIF stripping), adapter selection,
                      # TOTP (RFC 6238 vectors), secret sealing, chargebacks, email
npx playwright install chromium   # once
npm run test:e2e      # Playwright: resets marketplace_test DB, builds, starts on :3100 with mocks
npm run test:a11y     # only the axe accessibility specs
npm run test:all      # all of the above
```

The E2E suite needs Postgres running (`npm run db:up`). It uses its own database (`marketplace_test`, created by `docker/postgres-init.sql`) and its own media folder, so your dev data is untouched. Set `E2E_SKIP_BUILD=1` to reuse an existing build.

| Spec | Covers |
| --- | --- |
| `browse-search` | Home sections, category/condition filters, price sort, prefix and accent-insensitive search, product page details, JSON-LD, sitemap/robots, live cart totals |
| `sell` | Sign up → ID verification → payouts → blurry photo rejected → wear close-up required → publish → search → edit |
| `buy-deliver-review` | Buy via hosted checkout → label → tracking → delivered → confirm (escrow release) → review on seller profile. Pickup scheduling flow. Cron auth |
| `dispute` | Dispute freezes payout → seller responds → moderator refunds → reviews stay locked |
| `messaging-moderation` | Buyer↔seller messages, saved items, listing report → moderator removal → 404 |
| `security` | CSRF origin check, 401/403/404 authorisation, role checks, XSS-safe message rendering, media path traversal |
| `a11y` | axe WCAG 2.1 A/AA on 20+ pages and states (signed out/in, dialogs, mobile nav, back office), in light and dark themes, skip link and keyboard focus |
| `admin` | Every admin page and endpoint refuses signed-out visitors (401/redirect) and members (403/404); moderator vs admin limits; disabling signs a member out; role changes; self-lockout guards; audit entries; listing edits, categories, search/sort/pagination |
| `account-security` | Password reset, enumeration resistance, email verification, two-factor enrolment, replay and guessing limits, recovery codes, and no bypass through reset or social sign-in |
| `chargebacks` | Freeze, evidence, won and lost outcomes, no double refund, scheduled job respects the freeze, permissions |
| `notifications` | Order, message and contact emails, and policy pages showing live fees |
| `privacy` | Data export contents, deletion blockers and proof, what a deleted account leaves behind |
| `staff-two-factor` | Starts a second server with the requirement on: staff are locked out of the back office until enrolled and can't turn it off |
| `theme` | Dark mode: system setting, saved choice, set before first paint, keyboard use, clean hydration on pages with a report dialog |
| `social-auth` | Google/Apple/Facebook via the simulator: new accounts, verified-email linking (and refusals), Apple relay emails and first-login names, cancel, state tampering and replay, disabled accounts, connect/disconnect in Settings |

---

## Seed photos and credits

Demo listings use real photos from Openverse (Flickr / Wikimedia Commons), all under **CC BY**, which allows commercial use with attribution:

- Sources and authors are in `db/seed-photos/sources.json`; processed files (WebP, metadata stripped) and `credits.json` are committed, so seeding works offline.
- Every product page shows the photo credits (title, author, license link, changes made).
- To refresh the photos: `npx tsx scripts/fetch-seed-photos.ts`.
- Some demo listings were written to match the photos available (e.g. colourway, model).

## Useful scripts

| Command | What it does |
| --- | --- |
| `npm run db:up` | Start Postgres only |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed demo data (`-- --if-empty` to skip when seeded) |
| `npm run db:reset` | Drop, migrate and seed (refuses non-local hosts) |

## Known limitations

- Rate limiting is in-memory (single instance). Use Redis/Upstash when running multiple instances.
- Messaging polls every 5 seconds rather than using websockets/SSE.
- The Stripe chargeback webhooks and the Resend adapter are tested with mocks and unit tests, not against the live services. E2E runs on mocks, which call the same chargeback code.
- A member who loses both their phone and their recovery codes needs manual help; there's no self-service or admin reset for two-factor yet.
- Social-only accounts confirm deletion by typing their email, so a stolen session could delete one that has no two-factor.
- Meta's data-deletion callback, which a live Facebook Login app needs, isn't built.
- One currency (USD) and US-only shipping.
- Seed photos are real, openly licensed (CC BY) photos of each product model, not photos of the exact listed items. Close-ups without a dedicated detail shot are crops of the main photo.
- The header account menu stays open after following one of its links client-side (existing behaviour, unchanged).
- Partial refunds are handled per order. Returns logistics (return labels) aren't modelled yet.

---

## Developer

Designed and built by **Ryan Kekulthotuwage**.
