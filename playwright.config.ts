import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

/**
 * E2E suite. Runs against a production build on a dedicated test database
 * (marketplace_test) that is reset + seeded before the server starts.
 * All integrations are forced onto their mocks, so no keys are needed.
 */
const testEnv = {
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? "postgres://marketplace:marketplace@localhost:54320/marketplace_test",
  APP_URL: baseURL,
  FORCE_MOCK_INTEGRATIONS: "1",
  // Local Google/Apple/Facebook simulator; refused unless APP_URL is localhost.
  OAUTH_MOCK: "1",
  DISABLE_RATE_LIMIT: "1",
  // The demo staff accounts sign in many times a minute here. tests/e2e/staff-two-factor.spec.ts
  // starts a second server with this unset, to test the requirement itself.
  STAFF_2FA_OPTIONAL: "1",
  MEDIA_DIR: ".data/media-test",
  CRON_SECRET: "e2e-cron-secret",
  NEXT_TELEMETRY_DISABLED: "1",
};

export default defineConfig({
  testDir: "tests/e2e",
  // Specs share one seeded database, so run them in order.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx tsx scripts/reset.ts && ${process.env.E2E_SKIP_BUILD ? "" : "npx next build && "}npx next start -p ${PORT} -H 127.0.0.1`,
    url: `${baseURL}/api/health`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: testEnv,
    stdout: "pipe",
  },
});
