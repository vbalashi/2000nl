import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

const artifactDirectory = resolve(process.cwd(), "../../artifacts/design-qa");

test.skip(
  process.env.APP_ROLLOUT_PROFILE !== "pilot",
  "Run through the pilot browser harness.",
);

test("captures the approved Training face and answer at the authoritative viewport", async ({
  browser,
}) => {
  await mkdir(artifactDirectory, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 402, height: 874 },
    colorScheme: "dark",
    deviceScaleFactor: 1,
  });
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualCard: true,
  });
  await page
    .getByRole("button", {
      name: /Начать с текущими настройками|Start with current settings|Start met huidige instellingen|Huidige selectie starten/i,
    })
    .click();

  const card = page.getByTestId("training-sense-card-v2");
  await expect(card).toBeVisible();
  await expect(page.getByTestId("training-sense-card-stage")).toHaveAttribute(
    "data-side",
    "face",
  );
  await page.screenshot({
    path: resolve(artifactDirectory, "training-face-402x874.png"),
  });

  await page
    .getByRole("button", {
      name: /Antwoord tonen|Показать ответ|Show answer/i,
    })
    .click();
  await page
    .getByRole("button", { name: /Vertalen|Перевести|Translate/i })
    .click();
  await expect(
    page.getByText("a piece of furniture that seats several people"),
  ).toBeVisible();
  await page.waitForTimeout(400);
  await expect(page.getByTestId("training-sense-card-stage")).toHaveAttribute(
    "data-side",
    "answer",
  );
  await page.screenshot({
    path: resolve(artifactDirectory, "training-answer-402x874.png"),
  });
  await page.close();
});

test("keeps the approved primitives responsive in light and wide layouts", async ({
  browser,
}) => {
  await mkdir(artifactDirectory, { recursive: true });
  for (const profile of [
    { name: "light-mobile", width: 402, height: 874, colorScheme: "light" as const },
    { name: "dark-wide", width: 1280, height: 900, colorScheme: "dark" as const },
  ]) {
    const page = await browser.newPage({
      viewport: { width: profile.width, height: profile.height },
      colorScheme: profile.colorScheme,
      deviceScaleFactor: 1,
    });
    await setupAuthenticatedTrainingAttributionPage(page, 0, {
      visualCard: true,
    });
    await page
      .getByRole("button", {
        name: /Начать с текущими настройками|Start with current settings|Start met huidige instellingen|Huidige selectie starten/i,
      })
      .click();
    await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
    await page.screenshot({
      path: resolve(artifactDirectory, `training-face-${profile.name}.png`),
    });
    await page.close();
  }
});

test("captures the approved long-idiom answer", async ({ browser }) => {
  await mkdir(artifactDirectory, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 402, height: 874 },
    colorScheme: "dark",
    deviceScaleFactor: 1,
  });
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualCard: true,
    visualLongCard: true,
  });
  await page
    .getByRole("button", {
      name: /Начать с текущими настройками|Start with current settings|Start met huidige instellingen|Huidige selectie starten/i,
    })
    .click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  await page
    .getByRole("button", {
      name: /Antwoord tonen|Показать ответ|Show answer/i,
    })
    .click();
  await expect(page.getByText("iets nodig hebben")).toBeVisible();
  await page.screenshot({
    path: resolve(artifactDirectory, "training-long-idiom-402x874.png"),
  });
  await page.close();
});

test("captures the approved recoverable-error state", async ({ browser }) => {
  await mkdir(artifactDirectory, { recursive: true });
  const page = await browser.newPage({
    viewport: { width: 402, height: 874 },
    colorScheme: "dark",
    deviceScaleFactor: 1,
  });
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualCard: true,
    invalidEntryIds: Array.from(
      { length: 10 },
      (_, index) => `attribution-word-${index + 1}`,
    ),
  });
  await page
    .getByRole("button", {
      name: /Начать с текущими настройками|Start with current settings|Start met huidige instellingen|Huidige selectie starten/i,
    })
    .click();
  await expect(page.getByTestId("training-v2-failure")).toBeVisible();
  await expect(page.getByTestId("training-session-app-header")).toBeVisible();
  await expect(
    page
      .getByTestId("training-session-app-header")
      .getByText("2000nl", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Sessie sluiten|Close session|Закрыть сессию/i }),
  ).toBeVisible();
  await expect(page.getByTestId("training-session-chrome")).toHaveCount(0);
  await expect(page.getByTestId("training-session-footer-progress")).toHaveCount(0);
  await page.waitForTimeout(100);
  await page.screenshot({
    path: resolve(artifactDirectory, "training-error-402x874.png"),
  });
  await page.close();
});
