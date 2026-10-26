import { expect, test } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

// Explicit opt-in: owns canonical port 3100 and swaps two already-built local
// images. Auth/dictionary calls are mocked; release metadata and documents are real.
test("real documents update A → B and rollback B → A without clearing storage", async ({
  page,
}, info) => {
  test.skip(
    process.env.RELEASE_PAIR_QA !== "1",
    "Requires two local production builds and exclusive port 3100",
  );
  test.setTimeout(90_000);
  let server: ChildProcess | null = null;
  const stop = async () => {
    if (server && server.exitCode === null) {
      const child = server;
      const closed = once(child, "exit");
      child.kill("SIGTERM");
      await closed;
    }
    server = null;
  };
  const start = async (dist: string) => {
    server = spawn(
      process.execPath,
      ["node_modules/next/dist/bin/next", "start", "--port", "3100"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NEXT_DIST_DIR: dist,
          NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
        },
        stdio: "ignore",
      },
    );
    await expect
      .poll(
        async () => {
          try {
            return (await fetch("http://127.0.0.1:3100/api/app-release"))
              .status;
          } catch {
            return 0;
          }
        },
        { timeout: 15_000 },
      )
      .toBe(200);
  };
  try {
    await start(".next");
    await page.addInitScript(() =>
      localStorage.setItem("onboarding_language", "en"),
    );
    await setupAuthenticatedTrainingAttributionPage(page, 0, {
      devTestLogin: false,
      visualProfile: "answer",
      settingsOverrides: {
        preferences: { onboardingLanguage: "en" },
        theme_preference: "light",
      },
    });
    await expect(page.getByTestId("app-header")).toBeVisible();
    await page.evaluate(() =>
      localStorage.setItem("release-preservation-probe", "keep"),
    );
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const updates = () =>
      page
        .getByRole("navigation", { name: "Settings sections", exact: true })
        .getByRole("button", { name: "Updates", exact: true });
    await updates().click();
    await expect(page.getByRole("status")).toContainText("up to date");
    await stop();
    await start(".next-release-b");
    const headers = await fetch("http://127.0.0.1:3100/");
    expect(headers.headers.get("cache-control")).toContain("no-store");
    await page.getByRole("button", { name: "Check for updates" }).click();
    await expect(
      page.getByRole("complementary", { name: "Updates" }),
    ).toBeVisible();
    await page
      .getByRole("complementary", { name: "Updates" })
      .getByRole("button", { name: "Update app" })
      .click();
    await expect(page.getByTestId("app-header")).toBeVisible();
    await updates().click();
    await expect(page.getByRole("status")).toContainText(
      /updated successfully|up to date/,
    );
    await expect(
      page.getByRole("complementary", { name: "Updates" }),
    ).toHaveCount(0);
    await expect(page.getByTestId("release-dot")).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        localStorage.getItem("release-preservation-probe"),
      ),
    ).toBe("keep");
    expect(new URL(page.url()).searchParams.get("destination")).toBe(
      "settings",
    );
    expect(new URL(page.url()).searchParams.has("_appRelease")).toBe(false);
    await page.screenshot({ path: info.outputPath("updated-b.png") });
    await stop();
    await start(".next");
    await page.getByRole("button", { name: "Check for updates" }).click();
    await expect(
      page.getByRole("complementary", { name: "Updates" }),
    ).toBeVisible();
    await page
      .getByRole("complementary", { name: "Updates" })
      .getByRole("button", { name: "Update app" })
      .click();
    await expect(page.getByTestId("app-header")).toBeVisible();
    await updates().click();
    await expect(page.getByRole("status")).toContainText(
      /updated successfully|up to date/,
    );
    await expect(page.getByTestId("release-dot")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("rollback-a.png") });
  } finally {
    await stop();
  }
});
