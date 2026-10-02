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
  await page.route("**/rpc/get_training_session_snapshot", async route => {
    await new Promise(resolve => setTimeout(resolve, 250));
    await route.fallback();
  });
  const card = page.getByTestId("training-sense-card-v2");
  await expect(card).toBeVisible();
  const readsBeforeIdle = authorityReads;
  await page.evaluate(() => {
    const initial = document.querySelector('[data-testid="training-sense-card-v2"]');
    const events: string[] = [];
    const observer = new MutationObserver(() => {
      if (document.querySelector("[data-authority-refreshing]")) {
        for (const button of document.querySelectorAll("[data-authority-refreshing] button:disabled")) {
          if (getComputedStyle(button).opacity !== "1") events.push("button-dimmed");
        }
      }
      if (!initial?.isConnected) events.push("card-detached");
      if (document.querySelector('[data-testid="training-v2-loading"]')) events.push("loading");
    });
    observer.observe(document.body, { childList: true, attributes: true, subtree: true });
    Object.assign(window, { continuity: { initial, events, observer } });
  });
  // Cross two real 20-second authority polls; fake timers would also change leases.
  await expect.poll(() => authorityReads - readsBeforeIdle, {timeout: 50_000}).toBeGreaterThanOrEqual(2);
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


test("@pilot ownership refresh fences answers without dimming; offline remains visibly blocked", async ({page}) => {
  await setupAuthenticatedTrainingAttributionPage(page, 0, {visualProfile: "answer", devTestLogin: process.env.TRAINING_RELIABILITY_DEV_LOGIN === "true"});
  await page.getByRole("button", {name: /^(Start training|Начать тренировку|Training starten)$/i}).click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  await page.route("**/rpc/get_training_session_snapshot", async route => { await new Promise(resolve => setTimeout(resolve, 700)); await route.fallback(); });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const surface = page.locator("[data-authority-refreshing]");
  await expect(surface).toBeVisible();
  const disabled = surface.locator("button:disabled");
  expect(await disabled.count()).toBeGreaterThan(0);
  expect(await disabled.evaluateAll(buttons => buttons.map(button => getComputedStyle(button).opacity))).toEqual(Array(await disabled.count()).fill("1"));
  await expect(surface).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  const reveal = page.getByRole("button", {name: /Show answer|Показать ответ|Antwoord Tonen/i});
  await expect(reveal).toBeDisabled();
  await expect(surface).toHaveCount(0);
});
