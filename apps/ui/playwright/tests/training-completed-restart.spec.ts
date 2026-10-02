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


for (const action of ["restart", "edit"] as const) test(`@pilot finite completion keeps the palette and supports ${action}`, async ({page}) => {
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, { visualProfile: "answer", devTestLogin, sessionPlannedTotal: 3 });
  await page.getByRole("button", {name: /^(Start training|Начать тренировку|Training starten)$/i}).click();
  for (let index = 0; index < 3; index++) {
    await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
    const reveal = page.getByRole("button", {name: /Show answer|Показать ответ|Antwoord Tonen/i});
    if (await reveal.isVisible()) await reveal.click();
    await page.getByRole("button", {name: /^(Good|Хорошо|Goed)$/i}).click();
    await expect.poll(() => fixture.requests.progressActions.length).toBe(index + 1);
    if (index < 2) await expect(reveal).toBeVisible();
  }
  const completed = page.getByTestId("training-usable-candidates-exhausted");
  await expect(completed).toHaveAttribute("data-training-v2-state", "completed");
  await expect(completed.getByRole("button")).toHaveCount(3);
  const colors: string[] = [];
  for (const dark of [false, true]) {
    await page.evaluate(value => document.documentElement.classList.toggle("dark", value), dark);
    const reading = completed.getByTestId("training-session-state");
    colors.push(await reading.evaluate(el => getComputedStyle(el).backgroundColor));
    expect(colors.at(-1)).not.toBe("rgba(0, 0, 0, 0)");
  }
  expect(colors[0]).not.toBe(colors[1]);
  if (action === "edit") {
    await page.getByRole("button", {name: /Edit training|Изменить тренировку|Training aanpassen/i}).click();
    await expect(page.getByRole("heading", {name: /Session builder|Настройка тренировки|Training samenstellen/i})).toBeVisible();
    await expect(page.getByRole("button", {name: /^(Start training|Начать тренировку|Training starten)$/i})).toBeVisible();
    expect(fixture.requests.sessionStarts).toHaveLength(1);
    return;
  }
  await page.getByRole("button", {name: /Start next session|Начать следующую сессию|Volgende sessie starten/i}).click();
  await expect.poll(() => fixture.requests.sessionStarts.length).toBe(2);
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
});


test("@pilot returning focus preserves Start and one click starts one run", async ({page}) => {
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {visualProfile: "answer", devTestLogin});
  const start = page.getByRole("button", {name: /^(Start training|Начать тренировку|Training starten)$/i});
  await expect(start).toBeEnabled();
  let refreshReads = 0;
  await page.route(/\/api\/(settings\/material|training\/setups)(\?|$)/, async route => {
    refreshReads += 1;
    await new Promise(resolve => setTimeout(resolve, 800)); await route.fallback();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => refreshReads).toBeGreaterThanOrEqual(2);
  await expect(start).toBeEnabled();
  await start.click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  expect(fixture.requests.sessionStarts).toHaveLength(1);
});
