import { expect, test } from "@playwright/test";
import { setupAuthenticatedTrainingAttributionPage } from "../support/trainingAttributionHarness";

const copy = {
  greeting: /Good morning|Goedemorgen|Доброе утро/i,
  statsPending: /Loading progress…|Voortgang laden…|Загружаем статистику…/i,
  cardPending:
    /Preparing your next card|Je volgende kaart wordt voorbereid|Подготавливаем следующую карточку/i,
  continue: /Continue session|Sessie doorgaan|Продолжить сессию/i,
  start: /Start current setup|Huidige selectie starten|Начать с текущими настройками/i,
  closeSession: /Close session|Sessie sluiten|Закрыть сессию/i,
  statsReady:
    /\d+ reviews due · \d+ new this study day|\d+ herhalingen klaar · \d+ nieuw deze studiedag|Повторений к выполнению: \d+ · новых за учебный день: \d+/i,
  adjust: /Adjust training|Training aanpassen|Настроить тренировку/i,
  setupHeading: /Build your session|Stel je sessie samen|Соберите сессию/i,
  rhythm: /Review ↔ new rhythm|Ritme herhaling|Ритм повторений/i,
  backToToday: /Back to Today|Terug naar Vandaag|Назад к экрану Сегодня/i,
};

test("prepared card and setup remain usable while scoped stats are held for 10 seconds", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const harness = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    statsDelayMs: 10_000,
    visualProfile: "answer",
    devTestLogin: true,
  });

  await expect.poll(() => harness.requests.stats.length).toBe(1);
  await expect.poll(() => harness.requests.scheduler.length).toBe(1);
  const statsRequestObservedAt = Date.now();
  await expect(page.getByRole("heading", { name: copy.greeting })).toBeVisible();
  const setupAvailableMs = Date.now() - statsRequestObservedAt;
  expect(setupAvailableMs).toBeLessThan(4_000);
  await expect(page.getByText(copy.statsPending).first()).toBeVisible();

  const continueSession = page.getByRole("button", { name: copy.continue });
  await expect(continueSession).toBeEnabled({ timeout: 4_000 });
  expect(harness.requests.sessionStarts).toHaveLength(0);
  expect(harness.requests.progressActions).toHaveLength(0);
  const todayScreenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach("today-with-prepared-card-and-stats-pending.png", {
    body: todayScreenshot,
    contentType: "image/png",
  });

  await page.getByRole("button", { name: copy.adjust }).click();
  await expect(page.getByRole("heading", { name: copy.setupHeading })).toBeVisible();
  await expect(page.getByRole("slider", { name: copy.rhythm })).toBeEnabled();
  await expect(page.getByText(copy.statsPending).first()).toBeVisible();
  const setupScreenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach("editable-setup-with-stats-pending.png", {
    body: setupScreenshot,
    contentType: "image/png",
  });
  await page.getByRole("button", { name: copy.backToToday }).click();
  await continueSession.click();
  await expect(page.getByRole("heading", { name: "huis" })).toBeVisible();
  expect(harness.requests.sessionStarts).toHaveLength(0);
  expect(harness.requests.session).toHaveLength(0);
  expect(harness.requests.progressActions).toHaveLength(0);
  expect(harness.requests.progressActionReconciliations).toHaveLength(0);

  await page.getByRole("button", { name: copy.closeSession }).click();
  await expect(page.getByRole("heading", { name: copy.greeting })).toBeVisible();
  await expect(page.getByText(copy.statsReady).first()).toBeVisible({
    timeout: 15_000,
  });
  const statsHeldDurationMs = Date.now() - statsRequestObservedAt;
  expect(statsHeldDurationMs).toBeGreaterThanOrEqual(9_000);
  expect(harness.requests.stats).toHaveLength(1);
  expect(harness.requests.scheduler).toHaveLength(1);
  expect(harness.requests.sessionStarts).toHaveLength(0);
  expect(harness.requests.session).toHaveLength(0);
  expect(harness.requests.progressActions).toHaveLength(0);
  expect(harness.requests.progressActionReconciliations).toHaveLength(0);

  await testInfo.attach("stats-hold-network-metrics.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          statsRequests: harness.requests.stats.length,
          schedulerRequests: harness.requests.scheduler.length,
          sessionStartRequests: harness.requests.sessionStarts.length,
          sessionCardSelectionRequests: harness.requests.session.length,
          progressActionRequests: harness.requests.progressActions.length,
          progressActionReconciliationRequests:
            harness.requests.progressActionReconciliations.length,
          setupAvailableMs,
          statsHeldDurationMs,
          configuredStatsDelayMs: 10_000,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
});

test("setup controls stay editable while the first-card request is held for 10 seconds", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const harness = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    schedulerDelayMs: 10_000,
    visualProfile: "answer",
    devTestLogin: true,
  });

  await expect.poll(() => harness.requests.scheduler.length).toBe(1);
  const schedulerRequestObservedAt = Date.now();
  await expect(page.getByRole("heading", { name: copy.greeting })).toBeVisible();
  const setupAvailableMs = Date.now() - schedulerRequestObservedAt;
  expect(setupAvailableMs).toBeLessThan(4_000);
  await expect(page.getByText(copy.cardPending)).toBeVisible();

  const continueSession = page.getByRole("button", { name: copy.continue });
  const startCurrentSetup = page.getByRole("button", { name: copy.start });
  await expect(continueSession).toBeDisabled();
  await expect(startCurrentSetup).toBeDisabled();
  expect(harness.requests.sessionStarts).toHaveLength(0);

  await page.getByRole("button", { name: copy.adjust }).click();
  await expect(page.getByRole("heading", { name: copy.setupHeading })).toBeVisible();
  await expect(page.getByRole("slider", { name: copy.rhythm })).toBeEnabled();
  await expect(startCurrentSetup).toBeDisabled();
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach("setup-while-card-request-pending.png", {
    body: screenshot,
    contentType: "image/png",
  });

  await page.getByRole("button", { name: copy.backToToday }).click();
  await expect(continueSession).toBeDisabled();
  await expect(continueSession).toBeEnabled({ timeout: 15_000 });
  const delayedDurationMs = Date.now() - schedulerRequestObservedAt;
  expect(delayedDurationMs).toBeGreaterThanOrEqual(9_000);
  await continueSession.click();
  await expect(page.getByRole("heading", { name: "huis" })).toBeVisible();
  expect(harness.requests.scheduler).toHaveLength(1);
  expect(harness.requests.stats).toHaveLength(1);
  expect(harness.requests.sessionStarts).toHaveLength(0);
  expect(harness.requests.session).toHaveLength(0);
  expect(harness.requests.progressActions).toHaveLength(0);
  expect(harness.requests.progressActionReconciliations).toHaveLength(0);

  await testInfo.attach("card-selection-hold-network-metrics.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          schedulerRequests: harness.requests.scheduler.length,
          statsRequests: harness.requests.stats.length,
          sessionStartRequests: harness.requests.sessionStarts.length,
          sessionCardSelectionRequests: harness.requests.session.length,
          progressActionRequests: harness.requests.progressActions.length,
          progressActionReconciliationRequests:
            harness.requests.progressActionReconciliations.length,
          setupAvailableMs,
          delayedDurationMs,
          configuredSchedulerDelayMs: 10_000,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
});

test("Continue waits for the selected card's projection while setup stays usable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const harness = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    lookupDelayMs: 10_000,
    visualProfile: "answer",
    devTestLogin: true,
  });

  await expect.poll(() => harness.requests.projectionLookups.length).toBe(1);
  const projectionRequestObservedAt = Date.now();
  await expect(page.getByRole("heading", { name: copy.greeting })).toBeVisible();
  const setupAvailableMs = Date.now() - projectionRequestObservedAt;
  expect(setupAvailableMs).toBeLessThan(4_000);
  await expect(page.getByText(copy.cardPending)).toBeVisible();
  const continueSession = page.getByRole("button", { name: copy.continue });
  await expect(continueSession).toBeDisabled();
  expect(harness.requests.sessionStarts).toHaveLength(0);
  expect(harness.requests.progressActions).toHaveLength(0);
  const screenshot = await page.screenshot({ fullPage: true });
  await testInfo.attach("setup-while-projection-request-pending.png", {
    body: screenshot,
    contentType: "image/png",
  });

  await page.getByRole("button", { name: copy.adjust }).click();
  await expect(page.getByRole("heading", { name: copy.setupHeading })).toBeVisible();
  await expect(page.getByRole("slider", { name: copy.rhythm })).toBeEnabled();
  await expect(continueSession).toBeDisabled();
  await page.getByRole("button", { name: copy.backToToday }).click();

  await expect(continueSession).toBeEnabled({ timeout: 15_000 });
  const projectionHeldDurationMs = Date.now() - projectionRequestObservedAt;
  expect(projectionHeldDurationMs).toBeGreaterThanOrEqual(9_000);
  await continueSession.click();
  await expect(page.getByRole("heading", { name: "huis" })).toBeVisible();
  expect(harness.requests.projectionLookups).toHaveLength(1);
  expect(harness.requests.sessionStarts).toHaveLength(0);
  expect(harness.requests.session).toHaveLength(0);
  expect(harness.requests.progressActions).toHaveLength(0);
  expect(harness.requests.progressActionReconciliations).toHaveLength(0);

  await testInfo.attach("projection-hold-network-metrics.json", {
    body: Buffer.from(
      JSON.stringify(
        {
          projectionRequests: harness.requests.projectionLookups.length,
          schedulerRequests: harness.requests.scheduler.length,
          statsRequests: harness.requests.stats.length,
          sessionStartRequests: harness.requests.sessionStarts.length,
          sessionCardSelectionRequests: harness.requests.session.length,
          progressActionRequests: harness.requests.progressActions.length,
          progressActionReconciliationRequests:
            harness.requests.progressActionReconciliations.length,
          setupAvailableMs,
          projectionHeldDurationMs,
          configuredProjectionDelayMs: 10_000,
        },
        null,
        2,
      ),
    ),
    contentType: "application/json",
  });
});
