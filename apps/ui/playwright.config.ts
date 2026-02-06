import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright/tests",
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    // Use a dedicated port to avoid colliding with a developer's already-running `npm run dev`.
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
    actionTimeout: 0,
    screenshot: "only-on-failure"
  },
  webServer: {
    command:
      "NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=test-anon npm run dev -- --hostname 0.0.0.0 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false
  }
});
