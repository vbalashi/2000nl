import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test("@pilot background account reconciliation retains the active session card", async ({ page }) => {
  await page.clock.install();
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer", userId: "40720000-0000-4000-8000-000000000001",
  });
  await page.getByRole("button", { name: /^(Start training|Начать тренировку|Training starten)$/i }).click();
  const card = page.getByTestId("training-sense-card-v2");
  await expect(card).toBeVisible();
  await page.waitForTimeout(300);
  const schedulerReads = fixture.requests.scheduler.length;
  const sessionStarts = fixture.requests.sessionStarts.length;
  let refreshes = 0;
  await page.route("**/rpc/get_learning_preferences", async route => {
    refreshes++;
    await route.fulfill({ json: {
      language_code: "nl", active_scenario: "understanding", card_filter: "review",
      modes_enabled: ["definition-to-word"], training_mode: "definition-to-word", new_review_ratio: 5,
    } });
  });
  await page.evaluate(() => {
    const initial = document.querySelector('[data-testid="training-sense-card-v2"]');
    const events: string[] = [];
    const observer = new MutationObserver(() => {
      if (!initial?.isConnected) events.push("card-detached");
      if (document.querySelector('[data-testid="training-v2-loading"]')) events.push("loading");
    });
    observer.observe(document.body, { childList: true, subtree: true });
    Object.assign(window, { preferenceContinuity: { initial, events, observer } });
  });
  // Reconcile hints on a disconnected broadcast transport poll every minute.
  await page.clock.fastForward(60_000);
  await page.clock.runFor(100);
  await expect.poll(() => refreshes).toBeGreaterThan(0);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => {
    const state = (window as unknown as { preferenceContinuity: { initial: Element; events: string[]; observer: MutationObserver } }).preferenceContinuity;
    state.observer.disconnect();
    return { connected: state.initial.isConnected, events: state.events };
  })).toEqual({ connected: true, events: [] });
  expect(fixture.requests.scheduler).toHaveLength(schedulerReads);
  expect(fixture.requests.sessionStarts).toHaveLength(sessionStarts);
  await expect(card).toBeVisible();
  await page.getByRole("button", { name: /Show answer|Показать ответ|Antwoord Tonen/i }).click();
  await page.getByRole("button", { name: /^(Good|Хорошо|Goed)$/i }).click();
  await expect.poll(() => fixture.requests.progressActions.length).toBe(1);
  await expect(card).toBeVisible();
});
