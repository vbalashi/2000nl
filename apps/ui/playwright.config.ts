import { defineConfig } from "@playwright/test";
import path from "node:path";

const optimizedLatency = process.env.PLAYWRIGHT_OPTIMIZED === "true";

export default defineConfig({
  testDir: "./playwright/tests",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    // Use a dedicated port to avoid colliding with a developer's already-running `npm run dev`.
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "on-first-retry",
    actionTimeout: 0,
    screenshot: "only-on-failure"
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: optimizedLatency
      ? "node scripts/playwright-production-server.mjs"
      : "npm run dev -- --hostname 0.0.0.0 --port 3100",
    timeout: optimizedLatency ? 180_000 : 60_000,
    url: "http://127.0.0.1:3100",
    // Version-update tests need deterministic build metadata, not the unknown dev identity.
    env: {
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: path.join(__dirname, "playwright/fixtures/next-font-google-mocked-responses.cjs"),
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
      NEXT_PUBLIC_APP_VERSION: "0.0.0-e2e",
      NEXT_PUBLIC_APP_COMMIT: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      NEXT_PUBLIC_BUILD_TIMESTAMP: "2026-10-17T08:00:00Z",
    },
    reuseExistingServer: false
  }
});
