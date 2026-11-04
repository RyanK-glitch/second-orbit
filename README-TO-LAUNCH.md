# Launch checklist: taking Second Orbit live

**Developer:** Ryan Kekulthotuwage

> Second Orbit is a portfolio project and isn't going live. This list records what a real launch would still take. Ticked items are built and tested, against mocks where a provider is involved.

Second Orbit was built as a **test-mode marketplace**: every integration has a local mock, the Stripe adapter refuses live keys, and demo accounts with a public password are seeded automatically. That is right for development and wrong for a business taking real money.

This file lists what to change, add and set up before the site goes live commercially. Each item says where in the code it lives, when there is code involved.

- **[Blocker]** Launching without it is unsafe or illegal, or real money won't work.
- **[Before launch]** Needed for a credible commercial launch.
- **[Soon after]** Can follow in the first weeks.

> The legal and tax items below are a checklist of topics to raise with a lawyer and an accountant in the country and states you trade in. They are not legal advice.

---

## 1. Code blockers (dangerous if left as they are)

| | What | Where | What to do |
|---|---|---|---|
| ☐ | **[Blocker]** Demo accounts are seeded in production, including `admin@example.com` with the public password `demo-password-1` | The `CMD` line in `Dockerfile`, which runs `npm run db:seed -- --if-empty`, `scripts/seed.ts` | Remove `db:seed` from the production start command. Never run `db:seed` or `db:reset` against the live database. If it was ever seeded, delete the `@example.com` users. |
| ☐ | **[Blocker]** The Stripe adapter refuses live keys on purpose | `src/lib/env.ts` → `integrations()` throws on `sk_live_` / `rk_live_` | Replace the check with an explicit opt-in, e.g. allow live keys only when `STRIPE_LIVE_MODE=1`, and keep refusing them in development. |
| ☐ | **[Blocker]** Mocks switch on silently whenever a key is missing, and the mock pages let anyone "pay", "pass ID checks" or "deliver" | `src/lib/env.ts`, `src/app/mock/*`, `src/app/api/mock/*` | Add a startup check: in production (`NODE_ENV=production`), refuse to boot if any integration resolves to `mock`, or if `FORCE_MOCK_INTEGRATIONS` or `OAUTH_MOCK` is set. Also return 404 from every `/mock` and `/api/mock` route in production. |
| ☐ | **[Blocker]** The "Test mode: no real money moves" banner always shows | `src/app/layout.tsx` (`.mock-banner`) | Show it only when an integration is mocked, or remove it. |
| ☐ | **[Blocker]** The social sign-in simulator must be off | `.env` (`OAUTH_MOCK=1` on the dev machine) | Production `OAUTH_MOCK` must be unset or `0`. The code already refuses it on a non-localhost `APP_URL`. |
| ☐ | **[Blocker]** There is no way to create the first real admin | — | After launch, sign up normally, then promote that account once by hand: set `role = 'admin'` on that row in the `users` table. Better: add a one-off `scripts/make-admin.ts`. |
| ☐ | **[Before launch]** Portfolio notices | `src/lib/brand.ts` (name, tagline), `src/app/layout.tsx` footer line "A portfolio project, not a real shop", and the sample-text notice in `src/components/LegalPage.tsx` | Confirm the name and tagline, and remove both notices. |
| ☐ | **[Before launch]** README describes test mode | `README.md` ("Test mode only", Stripe section) | Update after the live-mode changes so nobody follows outdated instructions. |
| ☐ | **[Before launch]** Not under version control | project folder has no git repository | `git init`, commit, push to a private remote (GitHub, GitLab). Check that `.env` is never committed (it is already in `.gitignore`). |

---

## 2. Features a real marketplace needs that don't exist yet

| | Feature | Why | Notes |
|---|---|---|---|
| ☑ | **[Blocker]** Password reset ("Forgot password") | Members can get back into their account by email. | Single-use, one-hour, hashed tokens. See `README.md` → Accounts, email and privacy. |
| ☑ | **[Blocker]** Transactional email | The app sends welcome, verification, password, order, dispute, refund, payout, chargeback and new-message emails. | Built as an outbox with a Resend adapter in `src/lib/integrations/email.ts`. For a live launch, set up SPF, DKIM and DMARC. **Apple relay addresses** (`@privaterelay.appleid.com`) only accept mail from domains you register in Apple's *Private Email Relay Service* settings. |
| ☑ | **[Before launch]** Email verification for password sign-ups | Proves the person owns the address. | Built, and sets `users.email_verified_at`. It doesn't restrict anything yet, and an unverified password account can still be auto-linked by a verified Google or Apple sign-in, which also signs out its existing sessions. |
| ☑ | **[Blocker]** Card chargebacks | A buyer can dispute the card charge with their bank, separately from the in-app dispute, and Stripe then pulls the money from the platform balance. | `charge.dispute.*` is handled in `src/app/api/webhooks/stripe/route.ts` and `src/lib/chargebacks.ts`: payouts freeze, staff are alerted and submit evidence at `/admin/chargebacks`. Not yet tried against live Stripe. |
| ☑ | **[Blocker]** Account deletion and data export | Required by GDPR (EU/UK) and CCPA/CPRA (California) and expected everywhere. | Built in Settings. Still open: Meta requires a **data deletion callback URL** before a Facebook Login app can go live. |
| ☑ | **[Before launch]** Two-factor sign-in for staff | Admin and moderator accounts can refund money and disable people, so a stolen password shouldn't be enough. | TOTP is required for `moderator` and `admin` roles unless `STAFF_2FA_OPTIONAL=1`, and any member can opt in. Passkeys aren't built. |
| ☑ | **[Before launch]** Legal pages | Stripe, Apple, Google and Meta all require a privacy policy URL, and you need terms to enforce anything. | Terms, Privacy, Seller agreement, Prohibited items, Fees, Buyer protection and Cookies are linked from the footer and the sign-up form. They're **sample text**: a real launch needs a lawyer to write them. |
| ☑ | **[Before launch]** Contact and help | People need a way to reach you. | A help page and contact form exist, and order pages link to it ("Problem with this order?"). Set a real `SUPPORT_EMAIL`. |
| ☐ | **[Before launch]** Sales tax | In most US states a marketplace is a *marketplace facilitator* and must collect and remit sales tax on its sellers' sales. Checkout currently charges no tax. | Stripe Tax can calculate it at checkout. Ask an accountant which states you're registered in. |
| ☐ | **[Soon after]** Returns | Refunds work, but there are no return shipping labels. | `README.md` → Known limitations. |
| ☐ | **[Soon after]** Real-time messaging | Messages poll every 5 seconds, which gets expensive with many users. | Server-sent events or a hosted service (Pusher, Ably). |
| ☐ | **[Soon after]** Seller payout and fee statements | Sellers will ask what they earned and what fees were taken. | A downloadable statement per month in Sales. |

---

## 3. Accounts and services to set up (live, not test)

Each one switches from mock to real when its environment variables are set. The full list with explanations is in `.env.example`.

| | Service | What to do | Env vars |
|---|---|---|---|
| ☐ | **Stripe (payments + Connect)** | Activate your live account (business details, bank account, identity). Turn on **Connect**, set your platform profile, branding and payout schedule, and choose who is liable for negative balances (with Express accounts it's the platform). Create a **live** webhook endpoint for `/api/webhooks/stripe` on the production domain, with the events listed in `README.md`, including `charge.dispute.*`. Confirm with Stripe how long you may hold funds before transferring them to sellers, against the inspection window. | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| ☐ | **Stripe Identity** | Enable it in live mode. Each verification is charged, so budget for it. | uses `STRIPE_SECRET_KEY`, `IDENTITY_PROVIDER` empty |
| ☐ | **EasyPost (shipping)** | Production API key, carrier accounts, billing. Webhook to `/api/webhooks/easypost` on the production domain, with a secret. | `EASYPOST_API_KEY`, `EASYPOST_WEBHOOK_SECRET` |
| ☐ | **Image storage + CDN** | An S3 bucket (or Cloudflare R2) with a CDN in front. Local disk storage does not survive redeploys or work with more than one server. The CSP picks up the CDN domain from `MEDIA_PUBLIC_URL`. | `S3_*`, `MEDIA_PUBLIC_URL` |
| ☐ | **PostgreSQL** | A managed database (Neon, Supabase, RDS, Cloud SQL, Render) with automatic daily backups and point-in-time recovery. Use SSL (`?sslmode=require`). Size the pool: `max: 10` per app instance in `src/lib/db.ts`. | `DATABASE_URL` |
| ☐ | **Google sign-in** | OAuth client for your real domain. Publish the consent screen ("In production"), add your logo, privacy policy and terms URLs, and complete brand verification. | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| ☐ | **Sign in with Apple** | Services ID for the real domain, domain verification, return URL `/api/auth/oauth/apple/callback` on that domain, `.p8` key. Register your email-sending domain for the private relay. | `APPLE_*` |
| ☐ | **Facebook Login** | Switch the app to **Live**. Provide the privacy policy URL, the data deletion callback (see section 2), app icon and category, and complete business verification. | `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` |
| ☐ | **Email provider** | The Resend adapter is built. Create an account and verify the sending domain (SPF, DKIM, DMARC). | `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` |
| ☐ | **Analytics** | Plausible site for the real domain. | `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` |
| ☐ | **Error tracking and uptime** | Sentry (or similar) for server and browser errors; an uptime monitor on `/api/health`. Today errors only go to `console.error`. | new |
| ☐ | **Redis** (if more than one server) | Rate limiting is in memory (`src/lib/rate-limit.ts`), so it resets on restart and doesn't work across instances. Use Upstash or Redis. | new |
| ☐ | **Domain, DNS and HTTPS** | Buy the domain, point it at the host, HTTPS everywhere. Set `APP_URL` to the exact `https://` address of the site: redirects, OAuth callbacks, the sitemap and secure cookies all depend on it. | `APP_URL` |

---

## 4. Legal, money and business

| | Item | Notes |
|---|---|---|
| ☐ | **[Blocker]** A registered business | Stripe live mode, payment terms and liability all need a legal entity. |
| ☐ | **[Blocker]** The word "escrow" | The site promises payments are "held in escrow". In several US states (California, for example) offering escrow services needs a licence. Funds held through Stripe Connect are not a licensed escrow. Ask a lawyer whether to rename it, e.g. to "payment protection" or "held until delivery". The text is in `src/app/page.tsx`, `src/app/layout.tsx` (metadata) and the order pages. |
| ☐ | **[Blocker]** Terms of Service and Seller Agreement | Cover the inspection window, disputes, refunds, fees (`PLATFORM_FEE_BPS`, `BUYER_PROTECTION_BPS`), prohibited items, account suspension, liability. They must match what the code does. |
| ☐ | **[Blocker]** Privacy Policy | List what you collect (name, email, addresses, ID verification result via Stripe, messages, photos, social sign-in data) and every processor (Stripe, EasyPost, storage host, email provider, Google, Apple, Meta, Plausible, error tracking). |
| ☐ | **[Before launch]** Tax reporting for sellers | US platforms must issue Form 1099-K to qualifying sellers. Stripe Connect can file these if you enable it. |
| ☐ | **[Before launch]** Sales tax registration | See section 2. |
| ☐ | **[Before launch]** Consumer and marketplace rules | Seller identity disclosure (INFORM Consumers Act in the US, DSA in the EU), product safety and recalls, counterfeit handling. |
| ☐ | **[Before launch]** Copyright notices | Register a DMCA agent if you host user uploads in the US, and publish a takedown process. |
| ☐ | **[Before launch]** Trademark | Check that "Second Orbit" is available before printing it anywhere. |
| ☐ | **[Soon after]** Insurance | General and cyber liability. |
| ☐ | **[Before launch]** Remove demo listing photos | The seed photos are CC BY images of product models, not real stock. They exist only in demo data, which must not reach production (section 1). |

---

## 5. Deployment and infrastructure

| | Item | Notes |
|---|---|---|
| ☐ | **Hosting** | Any Node 22 host or the provided `Dockerfile` (Fly.io, Render, Railway, AWS, Google Cloud Run). Vercel works for the Next.js app. |
| ☐ | **Production start command** | `npm run db:migrate && npm run start`. No seeding (section 1). Run migrations once per deploy, before new code takes traffic. |
| ☐ | **Environment variables** | Fill in every value from `.env.example` in the host's secret store. Never put real keys in files in the repo. `FORCE_MOCK_INTEGRATIONS`, `OAUTH_MOCK`, `SHOW_DEMO_ACCOUNTS` and `STAFF_2FA_OPTIONAL` must be unset, and `TWO_FACTOR_KEY` must be a long random value. |
| ☐ | **Scheduled job** | `POST /api/cron/release-funds` every ~15 minutes with header `Authorization: Bearer $CRON_SECRET`. It pays sellers when the inspection window ends, expires abandoned checkouts, cleans up uploads, sends inspection reminders and retries unsent email. Set a long random `CRON_SECRET`. Without it, **sellers never get paid automatically**. |
| ☐ | **Webhooks** | Stripe and EasyPost (section 3), pointing at the production domain, signature secrets set. Test each with the provider's "send test event". |
| ☐ | **Backups** | Daily database backups plus point-in-time recovery, and the image bucket versioned. **Test a restore** once before launch. |
| ☐ | **CI** | Run `npm run test:all` (typecheck, unit tests, end-to-end tests) on every push, and block deploys when it fails. |
| ☐ | **Rollback plan** | Migrations are forward-only (`scripts/migrate.ts`); each file under `db/migrations/` notes how to undo it by hand. Take a backup before every deploy that includes a migration. |
| ☐ | **Logs** | Keep application logs at least 30 days. Never log card data, ID documents, passwords or tokens. The app doesn't today, so keep it that way. |

---

## 6. Security before launch

| | Item | Notes |
|---|---|---|
| ☑ | Staff two-factor sign-in | Section 2. |
| ☐ | Dependency audit | `npm audit`, update to patched versions, and turn on Dependabot/Renovate. |
| ☐ | Independent security review or penetration test | Focus on payments, refunds, admin endpoints, uploads, social sign-in. |
| ☐ | Content Security Policy | `next.config.ts` allows `'unsafe-inline'` scripts. Move to nonce-based scripts when you can. |
| ☐ | Admin access | Keep the number of admins small. Review the audit log (`/admin/audit`) regularly. |
| ☐ | Secrets rotation | Rotate any key that was ever pasted into chat, email or a ticket. |
| ☐ | Rate limits | Move to Redis (section 3) and add limits on messaging, reports and listing creation. |

---

## 7. Operations

| | Item | Notes |
|---|---|---|
| ☐ | Trust & Safety staffing | Who works the moderation queue (`/admin/moderation`), and how fast? Disputes freeze sellers' money, so publish a response time and meet it. |
| ☐ | Support inbox and macros | Prepared replies for "where is my order", refunds, account locked, seller verification failed. |
| ☐ | Fraud playbook | What to do about stolen cards, fake listings, off-platform payment requests (the app already warns in messages), repeat disputes. |
| ☐ | Incident plan | Who gets alerted when payments, webhooks or the site fail; how you tell users. |
| ☐ | Business metrics | The back office (`/admin`) shows sales, escrow held, fees and members. Decide which numbers you check daily. |

---

## 8. Final checks on the live site before opening it

1. Sign up with a real email; receive the verification and welcome emails.
2. Reset the password from the sign-in page.
3. Sign in with Google, Apple and Facebook on the real domain, on a phone and a desktop.
4. Become a seller: real ID verification and payout onboarding with your own details.
5. List an item with real photos; check it appears in search and on the home page.
6. From another account, **buy it with a real card for a small amount**, then:
   - buy a shipping label and follow tracking to delivered;
   - confirm receipt and check the seller payout arrives in the bank account;
   - repeat with a dispute and a refund, and check the money returns to the card.
7. Leave the inspection window to lapse on one order and confirm the scheduled job pays the seller.
8. Check the admin back office with a staff account that has two-factor sign-in.
9. Run `npm run test:all` against a staging copy of production settings.
10. Check `/robots.txt` and `/sitemap.xml` on the live domain, the page titles, and the social preview image.
11. Delete every test account and test listing you created, or mark them so they don't show.

## Launch-day order

1. Database backup taken and a restore tested.
2. Deploy with mocks impossible in production (section 1) and every env var set.
3. Run migrations.
4. Create your admin account, promote it, turn on two-factor sign-in.
5. Point webhooks at production and send a test event from each provider.
6. Start the 15-minute `release-funds` schedule.
7. Do one real purchase end to end (section 8, step 6).
8. Open sign-ups.
