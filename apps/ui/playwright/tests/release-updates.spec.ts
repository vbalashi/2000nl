import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";
const announcement = {
  id: "two-languages",
  publishedAt: "2026-10-17T09:00:00Z",
  locale: "en",
  title: "Two languages on each card",
  summary:
    "Choose a second translation language for dictionary entries and training answers.",
  detailsUrl: "https://example.org/blog/two-languages",
};
for (const profile of [
  { name: "desktop", width: 1440, height: 1024, dark: false },
  { name: "phone", width: 390, height: 844, dark: false },
  { name: "phone-dark", width: 390, height: 844, dark: true },
])
  test(`release notification and Updates ${profile.name}`, async ({
    page,
  }, info) => {
    await page.addInitScript(() =>
      localStorage.setItem("onboarding_language", "en"),
    );
    await page.setViewportSize(profile);
    await page.emulateMedia({ colorScheme: profile.dark ? "dark" : "light" });
    await page.route("**/api/app-release", (route) =>
      route.fulfill({
        json: {
          schemaVersion: 1,
          build: {
            version: "0.18.1339",
            commit: "c".repeat(40),
            buildTimestamp: "2026-10-17T09:00:00Z",
          },
          announcement,
        },
      }),
    );
    await setupAuthenticatedTrainingAttributionPage(page, 0, {
      devTestLogin: false,
      visualProfile: "answer",
      settingsOverrides: {
        preferences: { onboardingLanguage: "en" },
        theme_preference: profile.dark ? "dark" : "light",
      },
    });
    const banner = page.getByRole("complementary", { name: "Updates" });
    await expect(banner).toBeVisible();
    await expect(
      banner.getByRole("button", { name: "Update app" }),
    ).toBeEnabled();
    await page.screenshot({
      path: info.outputPath("banner.png"),
      fullPage: true,
    });
    await banner.getByRole("button", { name: "Later" }).click();
    await expect(banner).not.toBeVisible();
    const header = page.getByTestId("app-header");
    await expect(header.getByTestId("release-dot")).toBeVisible();
    await header.getByRole("button", { name: "Settings", exact: true }).click();
    const menu = page.getByRole("navigation", {
      name:
        profile.width < 700 ? "Mobile settings sections" : "Settings sections",
      exact: true,
    });
    await menu.getByRole("button", { name: "Updates", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Two languages on each card" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Update app" }),
    ).toBeEnabled();
    await expect(
      header.getByRole("button", { name: "Settings", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("button", { name: "Library", exact: true }),
    ).not.toHaveAttribute("aria-current", "page");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("updates.png"),
      fullPage: true,
    });
    await page.reload();
    await expect(banner).not.toBeVisible();
    await expect(header.getByTestId("release-dot")).toBeVisible();
  });
test("active training defers notification and disables update in Settings", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.addInitScript(() =>
    localStorage.setItem("onboarding_language", "en"),
  );
  const live = await (await page.request.get("/api/app-release")).json();
  let outdated = false;
  await page.route("**/api/app-release", (route) =>
    route.fulfill({
      json: outdated
        ? { ...live, build: { ...live.build, commit: "c".repeat(40) } }
        : live,
    }),
  );
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    devTestLogin: false,
    visualProfile: "answer",
    settingsOverrides: { preferences: { onboardingLanguage: "en" } },
  });
  await page
    .getByRole("button", {
      name: /^(Start training|Начать тренировку|Training starten)$/i,
    })
    .click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  await expect(page.getByTestId("app-header")).toBeVisible();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Settings sections", exact: true })
    .getByRole("button", { name: "Updates", exact: true })
    .click();
  outdated = true;
  await page.getByRole("button", { name: "Check for updates" }).click();
  await expect(
    page.getByRole("button", { name: "Update app", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("complementary", { name: "Updates" }),
  ).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Finish your training");
});
