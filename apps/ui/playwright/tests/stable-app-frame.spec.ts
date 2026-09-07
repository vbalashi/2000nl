import { expect, test, type Page } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test.skip(
  process.env.APP_ROLLOUT_PROFILE !== "pilot",
  "Run the stable application-frame characterization through the pilot harness.",
);

const startButton =
  /Начать с текущими настройками|Start with current settings|Start met huidige instellingen|Huidige selectie starten/i;
const answerButton = /Antwoord tonen|Показать ответ|Show answer/i;

async function preparePilotPage(
  page: Page,
  options: { actionDelayMs?: number } = {},
) {
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer",
    actionDelayMs: options.actionDelayMs,
  });
  await expect(page.getByRole("button", { name: startButton })).toBeVisible();
}

async function startSession(page: Page) {
  await page.getByRole("button", { name: startButton }).click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
}

async function visibleDesktopNavigation(page: Page) {
  const navigation = page.locator(
    '[data-app-primary-navigation="desktop"] nav:visible',
  );
  await expect(navigation).toHaveCount(1);
  return navigation;
}

async function frameSnapshot(page: Page) {
  const root = page.locator('[data-app-frame="true"]');
  const header = root.locator('[data-app-header="true"]');
  const logo = header.getByLabel("2000nl");
  const utility = header
    .getByRole("button", { name: /Thema|Theme|Тема/ })
    .first();
  const [rootBox, headerBox, logoBox, utilityBox] = await Promise.all([
    root.boundingBox(),
    header.boundingBox(),
    logo.boundingBox(),
    utility.boundingBox(),
  ]);
  const colors = await header.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      background: style.backgroundColor,
      borderBottom: style.borderBottomColor,
    };
  });
  expect(rootBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  expect(logoBox).not.toBeNull();
  expect(utilityBox).not.toBeNull();
  return {
    rootBox: rootBox!,
    headerBox: headerBox!,
    logoBox: logoBox!,
    utilityBox: utilityBox!,
    colors,
  };
}

test.describe("stable application frame", () => {
  test("active Training keeps the desktop app header and primary navigation", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await preparePilotPage(page);

    const today = page.locator('[data-training-pilot-surface="today"]');
    await expect(today).toBeVisible();
    const todayFrame = await frameSnapshot(page);
    await expect(
      page.locator('[data-app-primary-navigation="desktop"] nav:visible'),
    ).toHaveCount(1);

    await startSession(page);
    const session = page.locator('[data-training-pilot-surface="session"]');
    await expect(session).toBeVisible();
    const sessionFrame = await frameSnapshot(page);

    // Red-first contract: starting Training must not replace the application
    // frame with a second header that drops the primary destinations.
    await expect(
      page.locator('[data-app-primary-navigation="desktop"] nav:visible'),
    ).toHaveCount(1);
    await expect(page.getByLabel("2000nl")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Thema|Theme|Тема/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Instellingen|Settings|Настройки/ }),
    ).toBeVisible();

    for (const [before, after] of [
      [todayFrame.headerBox, sessionFrame.headerBox],
      [todayFrame.logoBox, sessionFrame.logoBox],
      [todayFrame.utilityBox, sessionFrame.utilityBox],
    ] as const) {
      expect(Math.abs(before.x - after.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(before.y - after.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(before.width - after.width)).toBeLessThanOrEqual(1);
      expect(Math.abs(before.height - after.height)).toBeLessThanOrEqual(1);
    }
    expect(sessionFrame.colors).toEqual(todayFrame.colors);
    expect(
      Math.abs(todayFrame.rootBox.width - sessionFrame.rootBox.width),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(todayFrame.rootBox.height - sessionFrame.rootBox.height),
    ).toBeLessThanOrEqual(1);
    await page.screenshot({
      path: testInfo.outputPath("desktop-active-training-light.png"),
    });
  });

  test("Library, Statistics and Settings return to the exact active card and side", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await preparePilotPage(page);
    await startSession(page);
    await page.getByRole("button", { name: answerButton }).click();

    const stage = page.getByTestId("training-sense-card-stage");
    const headword = await stage.getByRole("heading").textContent();
    const side = await stage.getAttribute("data-side");
    const trainingFrame = await frameSnapshot(page);
    expect(headword).toBe("bank");
    expect(side).toBe("answer");

    const trainingRoot = page.locator(
      '[data-training-pilot-surface="session"]',
    );
    const returnToTraining = async () => {
      const navigation = await visibleDesktopNavigation(page);
      await navigation.getByRole("button", { name: "Training" }).click();
      await expect(trainingRoot).toBeVisible();
      await expect(stage.getByRole("heading")).toHaveText(headword!);
      await expect(stage).toHaveAttribute("data-side", side!);
    };

    let navigation = await visibleDesktopNavigation(page);
    await navigation.getByRole("button", { name: "Bibliotheek" }).click();
    await expect(
      page.getByRole("heading", { name: "Bibliotheek" }),
    ).toBeVisible();
    const libraryWorkspace = page.getByTestId("library-workspace");
    const libraryBox = await libraryWorkspace.boundingBox();
    expect(libraryBox).not.toBeNull();
    expect(libraryBox!.width).toBeLessThanOrEqual(1200);
    expect(
      Math.abs(libraryBox!.x - (1440 - libraryBox!.width) / 2),
    ).toBeLessThanOrEqual(1);
    const libraryFrame = await frameSnapshot(page);
    expect(libraryFrame.headerBox).toEqual(trainingFrame.headerBox);
    expect(libraryFrame.colors).toEqual(trainingFrame.colors);
    await page.screenshot({
      path: testInfo.outputPath("desktop-library-dark.png"),
    });
    await returnToTraining();

    navigation = await visibleDesktopNavigation(page);
    await navigation.getByRole("button", { name: "Statistieken" }).click();
    await expect(
      page.getByRole("heading", { name: "Statistieken" }),
    ).toBeVisible();
    const statisticsFrame = await frameSnapshot(page);
    expect(statisticsFrame.headerBox).toEqual(trainingFrame.headerBox);
    expect(statisticsFrame.colors).toEqual(trainingFrame.colors);
    await returnToTraining();

    await page.getByRole("button", { name: "Instellingen" }).click();
    await expect(
      page.getByRole("heading", { name: "Instellingen" }),
    ).toBeVisible();
    const settingsFrame = await frameSnapshot(page);
    expect(settingsFrame.headerBox).toEqual(trainingFrame.headerBox);
    expect(settingsFrame.colors).toEqual(trainingFrame.colors);
    await returnToTraining();
  });

  test("mobile Training has one reachable destination navigation treatment", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await preparePilotPage(page);

    const visibleTreatment = page.locator(
      "[data-app-mobile-navigation]:visible",
    );
    await expect(visibleTreatment).toHaveCount(1);
    const strategy = "menu";
    await startSession(page);
    await expect(visibleTreatment).toHaveCount(1);
    await expect(visibleTreatment).toHaveAttribute(
      "data-app-mobile-navigation",
      strategy!,
    );

    await visibleTreatment
      .getByRole("button", { name: /Navigatie: Training/ })
      .click();
    const choices = page.getByRole("group", { name: "Navigatie" });
    await expect(
      choices.getByRole("button", { name: "Training" }),
    ).toBeVisible();
    await expect(
      choices.getByRole("button", { name: "Bibliotheek" }),
    ).toBeVisible();
    await expect(
      choices.getByRole("button", { name: "Statistieken" }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("mobile-training-menu-open-dark.png"),
    });
  });

  test("compact phone keeps the shared header and session controls in bounds", async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
    await preparePilotPage(page);
    await startSession(page);

    await expect(page.getByTestId("app-header")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Navigatie: Training/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sessie sluiten" }),
    ).toBeVisible();
    await expect(page.getByText("Herhaling", { exact: true })).toBeVisible();
    expect(
      await page.locator("html").evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    ).toEqual({ clientWidth: 320, scrollWidth: 320 });
    await page.screenshot({
      path: testInfo.outputPath("compact-phone-training-dark.png"),
    });
  });

  test("pending review action immediately blocks every session exit", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 600 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    await preparePilotPage(page, { actionDelayMs: 900 });
    await startSession(page);
    await page.getByRole("button", { name: answerButton }).click();

    await page.getByRole("button", { name: "Goed", exact: true }).click();

    const desktopNavigation = await visibleDesktopNavigation(page);
    await expect(
      desktopNavigation.getByRole("button", { name: "Bibliotheek" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Geschiedenis" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Sessie sluiten" }),
    ).toBeDisabled();

    await expect(
      desktopNavigation.getByRole("button", { name: "Bibliotheek" }),
    ).toBeEnabled({ timeout: 3_000 });
    expect(
      await page.locator("html").evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    ).toEqual({ clientWidth: 1024, scrollWidth: 1024 });
  });
});
