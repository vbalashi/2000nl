import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

const artifactDirectory = resolve(process.cwd(), "../../artifacts/design-qa");

async function advanceToApprovedPosition(page: import("@playwright/test").Page) {
  for (let position = 1; position < 10; position += 1) {
    await page
      .getByRole("button", {
        name: /Antwoord tonen|Показать ответ|Show answer/i,
      })
      .click();
    const learn = page.getByRole("button", {
      name: /Begin met leren|Учить|Start learning/i,
    });
    if (await learn.isVisible().catch(() => false)) {
      await learn.click();
    } else {
      await page.getByRole("button", { name: /Goed|Хорошо|Good/i }).click();
    }
    await expect(page.getByTestId("training-session-position")).toHaveText(
      `${position + 1} / 23`,
    );
  }
}

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
    visualProfile: "answer",
  });
  await page
    .getByRole("button", {
      name: /Начать с текущими настройками|Start with current settings|Start met huidige instellingen|Huidige selectie starten/i,
    })
    .click();

  const card = page.getByTestId("training-sense-card-v2");
  await expect(card).toBeVisible();
  await advanceToApprovedPosition(page);
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
    for (const state of ["face", "answer", "long-idiom", "recoverable-error"] as const) {
      const page = await browser.newPage({
        viewport: { width: profile.width, height: profile.height },
        colorScheme: profile.colorScheme,
        deviceScaleFactor: 1,
      });
      await setupAuthenticatedTrainingAttributionPage(page, 0, {
        visualProfile: state,
      });
      await page
        .getByRole("button", {
          name: /Начать с текущими настройками|Start with current settings|Start met huidige instellingen|Huidige selectie starten/i,
        })
        .click();
      if (state === "recoverable-error") {
        await expect(page.getByTestId("training-v2-failure")).toBeVisible();
      }
      else {
        await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
        await advanceToApprovedPosition(page);
        if (state !== "face") {
          await page.getByRole("button", { name: /Antwoord tonen|Показать ответ|Show answer/i }).click();
        }
        if (state === "answer") {
          await page.getByRole("button", { name: /Vertalen|Перевести|Translate/i }).click();
        }
        const cardBox = await page.getByTestId("training-sense-card-shell").boundingBox();
        expect(cardBox).not.toBeNull();
        expect(cardBox!.x).toBeGreaterThanOrEqual(0);
        expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(profile.width);
        await expect(page.getByTestId("training-sense-card-dock")).toBeVisible();
      }
      await expect(page.locator("body")).toHaveCSS("overflow-x", "visible");
      if (profile.colorScheme === "light" && state !== "recoverable-error") {
        const footerTrack = page
          .getByTestId("training-session-footer-progress")
          .locator("> div > div > div")
          .first();
        await expect(footerTrack).not.toHaveCSS(
          "background-color",
          "rgb(75, 83, 96)",
        );
      }
      await page.screenshot({
        path: resolve(artifactDirectory, `training-${state}-${profile.name}.png`),
      });
      await page.close();
    }
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
    visualProfile: "long-idiom",
  });
  await page
    .getByRole("button", {
      name: /Начать с текущими настройками|Start with current settings|Start met huidige instellingen|Huidige selectie starten/i,
    })
    .click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  await advanceToApprovedPosition(page);
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
    visualProfile: "recoverable-error",
  });
  await page.evaluate(() => {
    const runtime = window as typeof window & {
      __errorLayoutViolations?: string[];
    };
    runtime.__errorLayoutViolations = [];
    new MutationObserver(() => {
      if (!document.querySelector('[data-training-v2-state="model-invalid"]')) return;
      requestAnimationFrame(() => {
        for (const testId of [
          "training-session-chrome",
          "training-session-footer-progress",
        ]) {
          const element = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
          if (element && element.getClientRects().length > 0) {
            runtime.__errorLayoutViolations?.push(testId);
          }
        }
      });
    }).observe(document.body, { childList: true, subtree: true });
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
  await expect(page.getByTestId("training-session-chrome")).toBeHidden();
  await expect(page.getByTestId("training-session-footer-progress")).toBeHidden();
  await page.evaluate(() => new Promise(requestAnimationFrame));
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __errorLayoutViolations?: string[] })
          .__errorLayoutViolations ?? [],
    ),
  ).toEqual([]);
  await page.screenshot({
    path: resolve(artifactDirectory, "training-error-402x874.png"),
  });
  await page.close();
});
