import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test("@pilot statement timeout retries selection only and reaches a ready card", async ({
  page,
}) => {
  const harness = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    schedulerOutcomes: ["statement-timeout", "card"],
  });

  await expect(
    page.getByText(
      /The next card could not be prepared|De volgende kaart kon niet worden voorbereid|Не удалось подготовить карточку/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Retry card preparation|Kaart opnieuw voorbereiden|Повторить подготовку карточки/ })
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
    page.getByText(
      /The next card could not be prepared|De volgende kaart kon niet worden voorbereid|Не удалось подготовить карточку/,
    ),
  ).toHaveCount(0);
});

test("@pilot statement timeout retry reports an honest no-match terminal outcome", async ({
  page,
}) => {
  const harness = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    schedulerOutcomes: ["statement-timeout", "empty"],
  });

  await expect(
    page.getByText(
      /The next card could not be prepared|De volgende kaart kon niet worden voorbereid|Не удалось подготовить карточку/,
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Retry card preparation|Kaart opnieuw voorbereiden|Повторить подготовку карточки/ })
    .click();

  await expect(
    page.getByText(
      /No card is ready for this setup|Er staat nog geen kaart klaar|Пока нет готовой карточки/,
    ),
  ).toBeVisible();
  expect(harness.requests.scheduler).toHaveLength(2);
  await expect(page.getByRole("heading", { name: "huis" })).toHaveCount(0);
});
