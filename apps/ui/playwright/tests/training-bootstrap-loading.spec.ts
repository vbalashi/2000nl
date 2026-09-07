import { expect, test, type Page } from "@playwright/test";
import {
  buildFakeSupabaseSession,
  installSupabaseSession,
} from "../utils/supabaseTestSession";
import {
  installTrainingAttributionCollector,
  readTrainingAttributionCapture,
  setupAuthenticatedTrainingAttributionPage,
} from "../support/trainingAttributionHarness";

const profiles = [
  {
    name: "desktop-1280x900-light",
    viewport: { width: 1280, height: 900 },
    colorScheme: "light" as const,
    language: "en" as const,
  },
  {
    name: "desktop-1280x900-dark",
    viewport: { width: 1280, height: 900 },
    colorScheme: "dark" as const,
    language: "nl" as const,
  },
  {
    name: "mobile-320x568-dark",
    viewport: { width: 320, height: 568 },
    colorScheme: "dark" as const,
    language: "ru" as const,
  },
  {
    name: "mobile-375x812-dark",
    viewport: { width: 375, height: 812 },
    colorScheme: "dark" as const,
    language: "ru" as const,
  },
  {
    name: "mobile-390x844-dark",
    viewport: { width: 390, height: 844 },
    colorScheme: "dark" as const,
    language: "nl" as const,
  },
  {
    name: "mobile-402x874-light",
    viewport: { width: 402, height: 874 },
    colorScheme: "light" as const,
    language: "en" as const,
  },
  {
    name: "mobile-412x915-dark",
    viewport: { width: 412, height: 915 },
    colorScheme: "dark" as const,
    language: "ru" as const,
  },
];

const bootstrapHeading = {
  en: "Preparing training",
  nl: "Training voorbereiden",
  ru: "Подготавливаем тренировку",
};

async function holdSessionRefresh(
  page: Page,
  language: keyof typeof bootstrapHeading,
) {
  const validSession = buildFakeSupabaseSession({
    id: "loading-qa-user",
    email: "loading-qa@2000nl.test",
  });
  const expiredSession = {
    ...validSession,
    expires_at: Math.floor(Date.now() / 1000) - 60,
    expires_in: 0,
  };
  let releaseRefresh: () => void = () => undefined;
  const refreshGate = new Promise<void>((resolve) => {
    releaseRefresh = resolve;
  });
  let refreshRequested = false;
  let releasePreferences: () => void = () => undefined;
  const preferencesGate = new Promise<void>((resolve) => {
    releasePreferences = resolve;
  });
  const preferenceRequests = new Set<string>();

  await page.route("**/auth/v1/token**", async (route) => {
    refreshRequested = true;
    await refreshGate;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validSession),
    });
  });
  await page.route("**/rest/v1/user_settings?**", async (route) => {
    preferenceRequests.add("app");
    await preferencesGate;
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-range": "0-0/1",
      },
      body: JSON.stringify([
        {
          theme_preference: "system",
          audio_quality: "free",
          translation_lang: language,
          preferences: { onboardingLanguage: language },
        },
      ]),
    });
  });
  await page.route(
    "**/rest/v1/rpc/get_learning_preferences",
    async (route) => {
      preferenceRequests.add("learning");
      await preferencesGate;
      await route.fulfill({
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          modes_enabled: ["word-to-definition"],
          card_filter: "both",
          language_code: "nl",
          new_review_ratio: 2,
          active_scenario: "understanding",
        }),
      });
    },
  );
  await installSupabaseSession(page, expiredSession);
  await page.addInitScript((savedLanguage) => {
    window.localStorage.setItem("onboarding_language", savedLanguage);
  }, language);

  return {
    releaseRefresh,
    refreshRequested: () => refreshRequested,
    releasePreferences,
    preferencesRequested: () => preferenceRequests.size === 2,
  };
}

for (const profile of profiles) {
  test(`auth bootstrap keeps one Training shell on ${profile.name}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize(profile.viewport);
    await page.emulateMedia({
      colorScheme: profile.colorScheme,
      reducedMotion: "reduce",
    });
    const refresh = await holdSessionRefresh(page, profile.language);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect.poll(refresh.refreshRequested).toBe(true);

    const shell = page.getByTestId("training-bootstrap-shell");
    await expect(shell).toBeVisible();
    await expect(
      shell.getByRole("heading", {
        name: bootstrapHeading[profile.language],
      }),
    ).toBeVisible();
    await expect(shell.getByTestId("training-loading-indicator")).toBeVisible();
    for (const misleadingCopy of [
      "Your navigation stays available",
      "De navigatie blijft beschikbaar",
      "Навигация остаётся доступной",
    ]) {
      await expect(shell).not.toContainText(misleadingCopy);
    }
    await expect(page.getByText("Laden…")).toHaveCount(0);
    await expect.poll(async () =>
      shell.evaluate((element) =>
        element.getAnimations().filter((animation) => animation.playState === "running")
          .length,
      ),
    ).toBe(0);
    const shellBox = await shell.boundingBox();
    const bootstrapHeaderBox = await shell.locator("header").boundingBox();
    expect(shellBox).not.toBeNull();
    expect(bootstrapHeaderBox).not.toBeNull();
    expect(shellBox!.x).toBe(0);
    expect(shellBox!.y).toBe(0);
    expect(shellBox!.width).toBe(profile.viewport.width);
    expect(shellBox!.height).toBe(profile.viewport.height);
    expect(
      await shell.evaluate(
        (element) => element.scrollWidth === element.clientWidth,
      ),
    ).toBe(true);
    await expect(page.getByText("1 error", { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`${profile.name}.png`),
      fullPage: true,
    });

    refresh.releaseRefresh();
    await expect.poll(refresh.preferencesRequested).toBe(true);
    await expect(shell).toBeVisible();
    await expect(
      shell.getByRole("heading", {
        name: bootstrapHeading[profile.language],
      }),
    ).toBeVisible();
    refresh.releasePreferences();
    const destinationShell = page.locator("[data-training-pilot-surface]");
    await expect(destinationShell).toBeVisible();
    await expect(shell).toHaveCount(0);
    await expect(page.getByText("Laden…")).toHaveCount(0);
    const destinationBox = await destinationShell.boundingBox();
    const destinationHeaderBox = await destinationShell.locator(":scope > header").boundingBox();
    expect(destinationBox).not.toBeNull();
    expect(destinationHeaderBox).not.toBeNull();
    expect(destinationBox!.width).toBe(shellBox!.width);
    expect(destinationBox!.height).toBe(shellBox!.height);
    expect(destinationHeaderBox!.width).toBe(bootstrapHeaderBox!.width);
    expect(destinationHeaderBox!.height).toBe(bootstrapHeaderBox!.height);
    expect(destinationHeaderBox!.x - destinationBox!.x).toBe(
      bootstrapHeaderBox!.x - shellBox!.x,
    );
    expect(destinationHeaderBox!.y - destinationBox!.y).toBe(
      bootstrapHeaderBox!.y - shellBox!.y,
    );
  });
}

test("delayed list hydration and card selection are attributed to startup", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await installTrainingAttributionCollector(page);
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    bootstrapReadDelayMs: 40,
    activeScopeDelayMs: 600,
    listSummaryDelayMs: 700,
    schedulerDelayMs: 1_200,
  });

  const authenticatedStatus = page.locator(
    '[role="status"][data-context="training"]',
  );
  await expect(authenticatedStatus).toBeVisible();
  await expect(authenticatedStatus).toHaveAttribute("aria-busy", "true");
  await expect(
    authenticatedStatus.getByRole("heading", {
      name: /Preparing training|Training voorbereiden|Подготавливаем тренировку/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Loading Training/i)).toHaveCount(0);

  await expect(
    authenticatedStatus.getByRole("heading", {
      name: /Loading card|Kaart laden|Загружаем карточку/i,
    }),
  ).toBeVisible();

  const startCurrentSettings = page.getByRole("button", {
    name: /Начать с текущими настройками|Start (?:with current settings|current setup)|Start met huidige instellingen/i,
  });
  await expect(startCurrentSettings).toBeVisible();
  await startCurrentSettings.click();

  // The card is the observable end of the complete startup chain: auth,
  // saved-list hydration, scheduler selection, and card presentation.
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();

  const capture = await readTrainingAttributionCapture(page);
  const hydration = capture.timings.find(
    (event) => event.stage === "training.active-scope-hydration",
  );
  expect(hydration).toMatchObject({ outcome: "ready" });
  expect(hydration?.durationMs ?? 0).toBeGreaterThanOrEqual(550);

  const startupSelection = capture.timings.find(
    (event) =>
      event.stage === "next-card.selection" &&
      event.transitionId === hydration?.transitionId,
  );
  expect(startupSelection).toMatchObject({ outcome: "ready" });
  expect(startupSelection?.durationMs ?? 0).toBeGreaterThanOrEqual(1_100);
  expect(startupSelection?.monotonicStartedAtMs ?? 0).toBeLessThan(
    startupSelection?.monotonicEndedAtMs ?? 0,
  );

  // A delayed list request must not be mistaken for a card-selection delay;
  // both stages remain separately visible under the same startup transition.
  expect(
    capture.timings.filter(
      (event) =>
        event.transitionId === hydration?.transitionId &&
        event.stage === "next-card.selection",
    ),
  ).toEqual(expect.arrayContaining([expect.objectContaining({ outcome: "ready" })]));
});
