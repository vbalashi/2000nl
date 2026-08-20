import { expect, test } from "@playwright/test";
import {
  installTrainingAttributionCollector,
  readTrainingAttributionCapture,
  setupAuthenticatedTrainingAttributionPage,
} from "../support/trainingAttributionHarness";

test.skip(
  process.env.APP_ROLLOUT_PROFILE !== "pilot",
  "Run this recovery check with APP_ROLLOUT_PROFILE=pilot.",
);

test("a failed prepared card recovers after closing and continuing on desktop and mobile", async ({
  browser,
}) => {
  const profiles = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ] as const;

  for (const profile of profiles) {
    const page = await browser.newPage({
      viewport: { width: profile.width, height: profile.height },
    });
    await installTrainingAttributionCollector(page);
    const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {
      invalidEntryIds: ["attribution-word-4"],
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
    await page
      .getByRole("button", {
        name: /Begin met leren|Учить|Start learning/i,
      })
      .click();

    const failure = page.getByTestId("training-v2-failure");
    await expect(failure).toHaveAttribute(
      "data-training-v2-state",
      "model-invalid",
    );
    await page
      .getByRole("button", {
        name: /Terug naar Vandaag|Вернуться на Сегодня|Back to Today/i,
      })
      .click();
    await expect(
      page.getByText(
        /20 reviews due|20 herhalingen klaar|Повторений к выполнению: 20/i,
      ),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: /Продолжить сессию|Continue session|Sessie voortzetten/i,
      })
      .click();
    await expect(failure).toBeVisible();
    await page
      .getByRole("button", {
        name: /Opnieuw proberen|Повторить|Try again/i,
      })
      .click();

    await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
    await expect(failure).not.toBeVisible();
    expect(fixture.requests.stats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          p_user_id: "training-attribution-user",
          p_modes: ["word-to-definition"],
          p_list_id: "list-attribution",
          p_list_type: "curated",
        }),
      ]),
    );
    const retryRequest = fixture.requests.scheduler.find((request) =>
      Array.isArray(request.p_exclude_card_keys) &&
      request.p_exclude_card_keys.includes(
        "attribution-word-4:word-to-definition",
      ),
    );
    expect(retryRequest).toMatchObject({
      p_user_id: "training-attribution-user",
      p_card_type_ids: ["word-to-definition"],
      p_list_id: "list-attribution",
      p_list_type: "curated",
      p_card_filter: "both",
      p_queue_turn: "review",
    });
    expect(retryRequest).not.toHaveProperty("p_training_filter");
    const capture = await readTrainingAttributionCapture(page);
    expect(
      capture.timings.some(
        (event) =>
          event.stage === "transition.total" &&
          event.outcome === "learn-error-model-invalid",
      ),
    ).toBe(true);
    expect(
      capture.timings.some(
        (event) =>
          event.stage === "transition.total" &&
          event.outcome === "continue-error-model-invalid",
      ),
    ).toBe(true);
    expect(
      capture.timings.some(
        (event) =>
          event.stage === "transition.total" &&
          event.outcome === "retry-ready",
      ),
    ).toBe(true);
    await page.close();
  }
});
