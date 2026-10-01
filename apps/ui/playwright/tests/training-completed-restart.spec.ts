import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test.skip(process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true", "Requires the approved training presentation.");
const devTestLogin = process.env.TRAINING_RELIABILITY_DEV_LOGIN === "true";

test("@pilot completed meaning session starts a new run directly from home", async ({ page }) => {
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    sessionOutcomes: ["card", "empty", "empty", "empty"],
    visualProfile: "answer",
    devTestLogin,
  });
  const start = page.getByRole("button", { name: /^(Start training|Начать тренировку|Training starten)$/i });
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  const reveal = page.getByRole("button", { name: /Show answer|Показать ответ|Antwoord Tonen/i });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByRole("button", { name: /^(Good|Хорошо|Goed)$/i }).click();
  await page.getByRole("button", { name: /Back to Training|Вернуться к тренировке|Terug naar Training|Terug naar training/i }).click();
  await expect(start).toBeEnabled();
  await expect(page.getByRole("button", { name: /Continue training|Продолжить тренировку|Training hervatten/i })).toHaveCount(0);
  await start.click();
  await expect.poll(() => fixture.requests.sessionStarts.length).toBe(2);
});

test("@pilot paused meaning session still continues the same run", async ({ page }) => {
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer", devTestLogin,
  });
  await page.getByRole("button", { name: /^(Start training|Начать тренировку|Training starten)$/i }).click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  await page.getByRole("button", { name: /Close session|Закрыть сессию|Sessie sluiten/i }).click();
  const resume = page.getByRole("button", { name: /Continue training|Продолжить тренировку|Training hervatten/i });
  await expect(resume).toBeEnabled();
  await resume.click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  expect(fixture.requests.sessionStarts).toHaveLength(1);
});
