import { expect, test } from "@playwright/test";
import {
  installTrainingAttributionCollector,
  readTrainingAttributionCapture,
  setupAuthenticatedTrainingAttributionPage,
} from "../support/trainingAttributionHarness";

test.skip(
  process.env.APP_ROLLOUT_PROFILE !== "pilot",
  "Run this action recovery check with APP_ROLLOUT_PROFILE=pilot.",
);

test("a disconnected Learn response reconciles without repeating the mutation", async ({
  page,
}) => {
  await installTrainingAttributionCollector(page);
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    abortFirstActionAfterMs: 80,
  });

  await page
    .getByRole("button", {
      name: /Начать с текущими настройками|Start with current settings|Start met huidige instellingen/i,
    })
    .click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  await page
    .getByRole("button", {
      name: /Antwoord Tonen|Показать ответ|Show answer/i,
    })
    .click();
  const learn = page.getByRole("button", {
    name: /Begin met leren|Учить|Start learning/i,
  });
  await learn.click();

  await expect(learn).not.toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Antwoord Tonen|Показать ответ|Show answer/i,
    }),
  ).toBeVisible();
  const capture = await readTrainingAttributionCapture(page);
  expect(capture.timings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        stage: "review.mutation.request",
        outcome: "attempt-1-transport-error",
      }),
      expect.objectContaining({
        stage: "review.reconciliation.request",
        outcome: "reconcile-http-200",
      }),
      expect.objectContaining({
        stage: "transition.total",
        outcome: "learn-ready",
      }),
    ]),
  );
});
