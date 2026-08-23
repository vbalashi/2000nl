import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test("@pilot statement timeout retries selection only and reaches a ready card", async ({
  page,
}) => {
  const harness = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    schedulerOutcomes: ["statement-timeout", "card"],
  });

  await expect(
    page.getByRole("heading", {
      name: /Training could not be loaded|Training kon niet worden geladen|Не удалось загрузить тренировку/,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Try again|Opnieuw proberen|Попробовать снова/ })
    .click();
  await page
    .getByRole("button", {
      name: /Continue session|Sessie voortzetten|Продолжить сессию/,
    })
    .waitFor();
  expect(harness.requests.scheduler.length).toBeGreaterThanOrEqual(2);
  expect(harness.requests.scheduler.slice(0, 2)).toEqual([
    expect.objectContaining({ p_exclude_card_keys: [] }),
    expect.objectContaining({ p_exclude_card_keys: [] }),
  ]);
  await page
    .getByRole("button", {
      name: /Continue session|Sessie voortzetten|Продолжить сессию/,
    })
    .click();

  await expect(page.getByRole("heading", { name: "huis" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /Training could not be loaded|Training kon niet worden geladen|Не удалось загрузить тренировку/,
    }),
  ).toHaveCount(0);
});

test("@pilot statement timeout retry reports an honest no-match terminal outcome", async ({
  page,
}) => {
  const harness = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    schedulerOutcomes: ["statement-timeout", "empty"],
  });

  await expect(
    page.getByRole("heading", {
      name: /Training could not be loaded|Training kon niet worden geladen|Не удалось загрузить тренировку/,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Try again|Opnieuw proberen|Попробовать снова/ })
    .click();

  await expect(
    page.getByRole("heading", {
      name: /No cards match this setup|Geen kaarten voor deze selectie|Для этих настроек нет карточек/,
    }),
  ).toBeVisible();
  expect(harness.requests.scheduler).toHaveLength(2);
  await expect(page.getByRole("heading", { name: "huis" })).toHaveCount(0);
});
