import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test("@pilot builder section changes and named save keep the app page alive", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const lifecycle: Array<{ type: string; url?: string }> = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) lifecycle.push({ type: "main-frame-navigation", url: frame.url() });
  });
  page.on("popup", (popup) => lifecycle.push({ type: "popup", url: popup.url() }));
  page.on("close", () => lifecycle.push({ type: "page-closed" }));
  page.on("crash", () => lifecycle.push({ type: "page-crashed" }));
  page.on("pageerror", (error) => pageErrors.push(`${error.name}: ${error.message}`));
  page.on("requestfailed", (request) => {
    const url = new URL(request.url());
    failedRequests.push(`${request.method()} ${url.pathname}`);
  });

  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer",
    settingsOverrides: { preferences: { onboardingLanguage: "en" } },
  });

  await page.route("**/rest/v1/rpc/get_training_scenarios", (route) => route.fulfill({
    json: [
      {
        id: "understanding",
        name_en: "Understanding",
        name_nl: "Begrip",
        card_modes: ["word-to-definition", "definition-to-word"],
        graduation_threshold: 21,
        enabled: true,
        sort_order: 1,
      },
      {
        id: "idiom",
        name_en: "Idioms",
        name_nl: "Uitdrukkingen",
        card_modes: ["word-to-definition", "definition-to-word"],
        graduation_threshold: 21,
        enabled: true,
        sort_order: 2,
      },
    ],
  }));

  let snapshot = {
    revision: 1,
    document: { schemaVersion: 1, mainTrainingId: null, trainings: [] as Array<Record<string, any>> },
  };
  const setupWrites: Array<{ method: string; trainingCount: number }> = [];
  await page.route("**/api/training/setups", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      snapshot = { revision: snapshot.revision + 1, document: body.document };
      setupWrites.push({ method: "PUT", trainingCount: body.document.trainings.length });
    }
    await route.fulfill({ json: snapshot });
  });
  await page.route("**/api/training/availability", (route) => route.fulfill({
    json: {
      dueToday: 0,
      totalReviews: 0,
      newCards: 20,
      studyDay: "2026-10-15",
      timezone: "Europe/Amsterdam",
      asOf: "2026-10-15T12:00:00.000Z",
    },
  }));

  await page.reload();
  await page.getByRole("button", { name: "Create training", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Session builder" })).toBeVisible();
  const routeAtBuilder = page.url();
  const navigationStart = lifecycle.length;

  for (const sectionName of ["Source", "Exercises", "Filters", "Session"]) {
    const section = page.getByRole("button", { name: new RegExp(`^${sectionName} `) });
    await section.click();
    await expect(section).toHaveAttribute("aria-expanded", "true");
    await section.click();
    await expect(section).toHaveAttribute("aria-expanded", "false");
  }

  await page.getByRole("button", { name: /^Exercises / }).click();
  await page.getByRole("button", { name: "Idioms", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Exercises Idioms/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Idioms", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Words", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Exercises Words/ })).toBeVisible();

  await page.getByRole("button", { name: "Save training", exact: true }).click();
  const saveDialog = page.getByRole("dialog", { name: "Save training" });
  await expect(saveDialog).toBeVisible();
  await saveDialog.getByRole("textbox", { name: "Training name" }).fill("Issue 704 repro");
  await saveDialog.getByRole("button", { name: "Save training", exact: true }).click();

  await expect(saveDialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Issue 704 repro", exact: true })).toBeVisible();
  await expect.poll(() => setupWrites.length).toBe(1);
  expect(setupWrites).toEqual([{ method: "PUT", trainingCount: 1 }]);
  expect(page.url()).toBe(routeAtBuilder);
  expect(page.url()).toMatch(/^https?:\/\//);
  expect(lifecycle.slice(navigationStart)).toEqual([]);
  expect(lifecycle.some((event) => event.type === "popup" || event.type === "page-closed" || event.type === "page-crashed")).toBe(false);
  expect(pageErrors).toEqual([]);
  expect(failedRequests.filter((request) => request.includes("/api/training/setups") || request.includes("/api/training/availability"))).toEqual([]);
  await testInfo.attach("builder-navigation-evidence.json", {
    body: JSON.stringify({ routeAtBuilder, finalRoute: page.url(), navigations: lifecycle, setupWrites, pageErrors, relevantFailedRequests: failedRequests.filter((request) => request.includes("/api/training/setups") || request.includes("/api/training/availability")) }, null, 2),
    contentType: "application/json",
  });
});
