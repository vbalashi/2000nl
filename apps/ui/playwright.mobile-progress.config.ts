import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./playwright/tests",
  testMatch: "mobile-meaning-progress.spec.ts",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3101",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
