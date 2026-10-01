import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

test.skip(process.env.NEXT_PUBLIC_TRAINING_PRESENTATION_V1 !== "true", "Requires approved presentation.");

test("@pilot idle authority checks retain the mounted card", async ({ page }) => {
  test.setTimeout(60_000);
  let authorityReads = 0;
  page.on("response", response => {
    if (response.url().includes("get_training_session_snapshot")) authorityReads += 1;
  });
  await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer", devTestLogin: process.env.TRAINING_RELIABILITY_DEV_LOGIN === "true",
  });
  await page.getByRole("button", { name: /^(Start training|Начать тренировку|Training starten)$/i }).click();
  const card = page.getByTestId("training-sense-card-v2");
  await expect(card).toBeVisible();
  const readsBeforeIdle = authorityReads;
  await page.evaluate(() => {
    const initial = document.querySelector('[data-testid="training-sense-card-v2"]');
    const events: string[] = [];
    const observer = new MutationObserver(() => {
      if (!initial?.isConnected) events.push("card-detached");
      if (document.querySelector('[data-testid="training-v2-loading"]')) events.push("loading");
    });
    observer.observe(document.body, { childList: true, subtree: true });
    Object.assign(window, { continuity: { initial, events, observer } });
  });
  // Cross two real 20-second authority polls; fake timers would also change leases.
  await page.waitForTimeout(42_000);
  expect(await page.evaluate(() => {
    const state = (window as unknown as { continuity: { initial: Element; events: string[]; observer: MutationObserver } }).continuity;
    state.observer.disconnect();
    return { connected: state.initial.isConnected, events: state.events };
  })).toEqual({ connected: true, events: [] });
  await expect(card).toBeVisible();
  expect(authorityReads - readsBeforeIdle).toBeGreaterThanOrEqual(2);
});

test("@pilot accepted finite-session actions advance to distinct targets", async ({ page }) => {
  const fixture = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    visualProfile: "answer", devTestLogin: process.env.TRAINING_RELIABILITY_DEV_LOGIN === "true",
    sessionSelectionDelayMs: 150, lookupDelayMs: 150,
  });
  await page.getByRole("button", { name: /^(Start training|Начать тренировку|Training starten)$/i }).click();
  for (let index = 0; index < 6; index += 1) {
    await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
    const reveal = page.getByRole("button", { name: /Show answer|Показать ответ|Antwoord Tonen/i });
    if (await reveal.isVisible()) await reveal.click();
    const good = page.getByRole("button", { name: /^(Good|Хорошо|Goed)$/i });
    await expect(good).toBeEnabled();
    await good.click();
    await expect.poll(() => fixture.requests.progressActions.length).toBe(index + 1);
    await expect(reveal).toBeVisible();
  }
  const targets = fixture.requests.progressActions.map((request) => {
    const target = request.target as { entryId: string; cardTypeId: string };
    return `${target.entryId}:${target.cardTypeId}`;
  });
  expect(new Set(targets).size).toBe(6);
});
