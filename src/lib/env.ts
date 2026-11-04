/**
 * Central configuration. Every third-party integration is selected here:
 * real SDK (test mode) when its keys are present, local mock otherwise.
 */
const read = (key: string) => (process.env[key] ?? "").trim();
const flag = (key: string) => ["1", "true", "yes"].includes(read(key).toLowerCase());
const int = (key: string, fallback: number) => {
  const n = Number.parseInt(read(key), 10);
  return Number.isFinite(n) ? n : fallback;
};

const forceMock = () => flag("FORCE_MOCK_INTEGRATIONS");

export const config = {
  get databaseUrl() {
    return read("DATABASE_URL") || "postgres://marketplace:marketplace@localhost:54320/marketplace";
  },
  get appUrl() {
    return (read("APP_URL") || "http://localhost:3000").replace(/\/$/, "");
  },
  get cronSecret() {
    return read("CRON_SECRET");
  },
  get platformFeeBps() {
    return int("PLATFORM_FEE_BPS", 800);
  },
  get buyerProtectionBps() {
    return int("BUYER_PROTECTION_BPS", 300);
  },
  get inspectionWindowHours() {
    return int("INSPECTION_WINDOW_HOURS", 48);
  },
  get mediaDir() {
    return read("MEDIA_DIR") || ".data/media";
  },
  stripe: {
    get secretKey() {
      return read("STRIPE_SECRET_KEY");
    },
    get webhookSecret() {
      return read("STRIPE_WEBHOOK_SECRET");
    },
  },
  easypost: {
    get apiKey() {
      return read("EASYPOST_API_KEY");
    },
    get webhookSecret() {
      return read("EASYPOST_WEBHOOK_SECRET");
    },
  },
  s3: {
    get bucket() {
      return read("S3_BUCKET");
    },
    get region() {
      return read("S3_REGION") || "us-east-1";
    },
    get endpoint() {
      return read("S3_ENDPOINT");
    },
    get accessKeyId() {
      return read("S3_ACCESS_KEY_ID");
    },
    get secretAccessKey() {
      return read("S3_SECRET_ACCESS_KEY");
    },
    get forcePathStyle() {
      return flag("S3_FORCE_PATH_STYLE");
    },
    get createBucket() {
      return flag("S3_CREATE_BUCKET");
    },
  },
  get mediaPublicUrl() {
    return read("MEDIA_PUBLIC_URL").replace(/\/$/, "");
  },
  email: {
    get resendApiKey() {
      return read("RESEND_API_KEY");
    },
    get from() {
      return read("EMAIL_FROM") || "Second Orbit <hello@second-orbit.example>";
    },
    /** Where the contact form goes, and the address shown on help pages. */
    get support() {
      return read("SUPPORT_EMAIL") || "support@second-orbit.example";
    },
  },
  /** Staff must have two-factor sign-in before the back office opens. Off only for local demos and the e2e suite. */
  get staffTwoFactorRequired() {
    return !flag("STAFF_2FA_OPTIONAL");
  },
  /** Seals TOTP secrets at rest. Has a throwaway default on localhost so a fresh clone runs with no setup. */
  get twoFactorKey() {
    const key = read("TWO_FACTOR_KEY");
    if (key) return key;
    if (isLocalApp()) return "local-development-only-two-factor-key";
    throw new Error("TWO_FACTOR_KEY must be set when APP_URL isn't localhost.");
  },
  get plausibleDomain() {
    return read("NEXT_PUBLIC_PLAUSIBLE_DOMAIN");
  },
  get plausibleHost() {
    return (read("NEXT_PUBLIC_PLAUSIBLE_HOST") || "https://plausible.io").replace(/\/$/, "");
  },
  oauth: {
    google: {
      get clientId() {
        return read("GOOGLE_CLIENT_ID");
      },
      get clientSecret() {
        return read("GOOGLE_CLIENT_SECRET");
      },
    },
    facebook: {
      get appId() {
        return read("FACEBOOK_APP_ID");
      },
      get appSecret() {
        return read("FACEBOOK_APP_SECRET");
      },
      get graphVersion() {
        return read("FACEBOOK_GRAPH_VERSION") || "v23.0";
      },
    },
    apple: {
      /** The Services ID (not the App ID), e.g. com.example.web */
      get clientId() {
        return read("APPLE_CLIENT_ID");
      },
      get teamId() {
        return read("APPLE_TEAM_ID");
      },
      get keyId() {
        return read("APPLE_KEY_ID");
      },
      /** Contents of the .p8 key. Newlines may be written as \n on one line. */
      get privateKey() {
        return read("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
      },
    },
  },
};

/** True when APP_URL points at this machine. Guards anything that would be dangerous on a shared host. */
export function isLocalApp() {
  return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(config.appUrl).hostname);
}

export type OAuthProviderId = "google" | "apple" | "facebook";

/**
 * Which social sign-in providers are offered: each one switches on when its keys are present.
 * OAUTH_MOCK=1 swaps all three for a local simulator (used by the e2e suite). Because the
 * simulator lets you claim any email, it is refused unless APP_URL points at this machine.
 */
export function oauthProviders(): { mode: "real" | "mock"; enabled: OAuthProviderId[] } {
  if (flag("OAUTH_MOCK")) {
    if (!isLocalApp()) {
      throw new Error("OAUTH_MOCK is only allowed when APP_URL is localhost. Remove it and set real provider keys.");
    }
    return { mode: "mock", enabled: ["google", "apple", "facebook"] };
  }
  const o = config.oauth;
  const enabled: OAuthProviderId[] = [];
  if (o.google.clientId && o.google.clientSecret) enabled.push("google");
  if (o.apple.clientId && o.apple.teamId && o.apple.keyId && o.apple.privateKey) enabled.push("apple");
  if (o.facebook.appId && o.facebook.appSecret) enabled.push("facebook");
  return { mode: "real", enabled };
}

export type Provider = "mock" | "stripe" | "stripe-identity" | "easypost" | "s3" | "local-disk" | "plausible" | "resend";

/** Which adapter each integration uses right now. */
export function integrations() {
  const mock = forceMock();
  const stripeKey = config.stripe.secretKey;
  if (stripeKey.startsWith("sk_live_") || stripeKey.startsWith("rk_live_")) {
    throw new Error("Refusing to use a live Stripe key. This project only supports Stripe test mode.");
  }
  const identityPref = read("IDENTITY_PROVIDER").toLowerCase();
  const payments: Provider = !mock && stripeKey ? "stripe" : "mock";
  const identity: Provider =
    !mock && stripeKey && identityPref !== "mock" ? "stripe-identity" : "mock";
  const shipping: Provider = !mock && config.easypost.apiKey ? "easypost" : "mock";
  const storage: Provider = !mock && config.s3.bucket ? "s3" : "local-disk";
  const analytics: Provider = !mock && config.plausibleDomain ? "plausible" : "mock";
  const email: Provider = !mock && config.email.resendApiKey ? "resend" : "mock";
  return { payments, identity, shipping, storage, analytics, email };
}

export const isMock = (kind: keyof ReturnType<typeof integrations>) => {
  const p = integrations()[kind];
  return p === "mock" || p === "local-disk";
};
