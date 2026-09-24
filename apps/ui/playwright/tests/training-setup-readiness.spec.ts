import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
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

function summarizeRequestIdentities(requests: Record<string, unknown>[]) {
  const groups = new Map<string, number[]>();
  requests.forEach((request, index) => {
    const identity = JSON.stringify(request);
    const indexes = groups.get(identity) ?? [];
    indexes.push(index);
    groups.set(identity, indexes);
  });
  return {
    total: requests.length,
    unique: groups.size,
    repeatedIdentities: requests.length - groups.size,
    identityGroups: [...groups.values()].map((requestIndexes) => ({
      requestIndexes,
    })),
  };
}

function shortFingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 10);
}

function expectOnlyOwnedSessionSelections(
  requests: Record<string, unknown>[],
) {
  expect(requests.length).toBeGreaterThanOrEqual(1);
  expect(
    requests.every(
      (request) => request.p_session_id === "training-session-fixture",
    ),
  ).toBe(true);
}

async function attachScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const path = testInfo.outputPath(name);
  await page.screenshot({ fullPage: true, path });
  await testInfo.attach(name, { path, contentType: "image/png" });
  return path;
}

async function attachMetrics(
  testInfo: TestInfo,
  name: string,
  metrics: Record<string, unknown>,
) {
  const path = testInfo.outputPath(name);
  await writeFile(path, JSON.stringify(metrics, null, 2));
  await testInfo.attach(name, { path, contentType: "application/json" });
  console.log(`[qa-evidence] ${path}`);
}

test("prepared card and setup remain usable while scoped stats are held for 10 seconds", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const harness = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    statsDelayMs: 10_000,
    visualProfile: "answer",
    devTestLogin: false,
  });

  await expect.poll(() => harness.requests.stats.length).toBe(1);
  await expect
    .poll(() => harness.requests.scheduler.length)
    .toBeGreaterThanOrEqual(1);
  const statsRequestObservedAt = harness.requests.requestTimes.stats[0]!;
  await expect(page.getByRole("heading", { name: copy.greeting })).toBeVisible();
  const setupAvailableMs = Date.now() - statsRequestObservedAt;
  expect(setupAvailableMs).toBeLessThanOrEqual(1_000);
  await expect(page.getByText(copy.statsPending).first()).toBeVisible();

  const startCurrentSetup = page.getByRole("button", { name: copy.start });
  await expect(page.getByRole("button", { name: copy.continue })).toHaveCount(0);
  await expect(startCurrentSetup).toBeEnabled({ timeout: 4_000 });
  expect(harness.requests.sessionStarts).toHaveLength(0);
  expect(harness.requests.stats).toHaveLength(1);
  expect(harness.requests.progressActions).toHaveLength(0);
  const initialStatsIdentitySummary = summarizeRequestIdentities(
    harness.requests.stats,
  );
  await attachScreenshot(
    page,
    testInfo,
    "today-with-prepared-card-and-stats-pending.png",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await attachScreenshot(
    page,
    testInfo,
    "mobile-today-with-stats-pending.png",
  );

  await page.getByRole("button", { name: copy.adjust }).click();
  await expect(page.getByRole("heading", { name: copy.setupHeading })).toBeVisible();
  await expect(page.getByRole("slider", { name: copy.rhythm })).toBeEnabled();
  const setupScreenshot = await attachScreenshot(
    page,
    testInfo,
    "editable-setup-with-stats-pending.png",
  );
  await attachScreenshot(
    page,
    testInfo,
    "mobile-editable-setup-with-stats-pending.png",
  );
  await page.getByRole("button", { name: copy.backToToday }).click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(startCurrentSetup).toBeEnabled();

  await startCurrentSetup.click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  expect(harness.requests.sessionStarts).toHaveLength(1);
  expectOnlyOwnedSessionSelections(harness.requests.session);
  expect(harness.requests.progressActions).toHaveLength(0);
  expect(harness.requests.progressActionReconciliations).toHaveLength(0);

  await page.getByRole("button", { name: copy.closeSession }).click();
  await expect(page.getByRole("heading", { name: copy.greeting })).toBeVisible();
  await expect(page.getByText(copy.statsReady).first()).toBeVisible({
    timeout: 15_000,
  });
  const statsHeldDurationMs = Date.now() - statsRequestObservedAt;
  expect(statsHeldDurationMs).toBeGreaterThanOrEqual(9_000);
  expect(harness.requests.stats.length).toBeGreaterThanOrEqual(1);
  expect(harness.requests.scheduler.length).toBeGreaterThanOrEqual(1);
  expect(harness.requests.sessionStarts).toHaveLength(1);
  expectOnlyOwnedSessionSelections(harness.requests.session);
  expect(harness.requests.progressActions).toHaveLength(0);
  expect(harness.requests.progressActionReconciliations).toHaveLength(0);

  expect(initialStatsIdentitySummary.total).toBe(1);
  expect(initialStatsIdentitySummary.repeatedIdentities).toBe(0);
  const schedulerIdentitySummary = summarizeRequestIdentities(
    harness.requests.scheduler,
  );
  expect(schedulerIdentitySummary.repeatedIdentities).toBe(0);
  await attachMetrics(testInfo, "stats-hold-network-metrics.json", {
    initialStatsRequestIdentities: initialStatsIdentitySummary,
    statsRequestsAfterStart: harness.requests.stats.length,
    schedulerRequestIdentities: schedulerIdentitySummary,
    sessionStartRequests: harness.requests.sessionStarts.length,
    sessionCardSelectionRequests: harness.requests.session.length,
    progressActionRequests: harness.requests.progressActions.length,
    progressActionReconciliationRequests:
      harness.requests.progressActionReconciliations.length,
    setupAvailableMs,
    statsHeldDurationMs,
    configuredStatsDelayMs: 10_000,
    screenshots: [
      testInfo.outputPath("today-with-prepared-card-and-stats-pending.png"),
      setupScreenshot,
      testInfo.outputPath("mobile-today-with-stats-pending.png"),
      testInfo.outputPath("mobile-editable-setup-with-stats-pending.png"),
    ],
  });
});

test("setup controls stay editable while the first-card request is held for 10 seconds", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const harness = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    schedulerDelayMs: 10_000,
    visualProfile: "answer",
    devTestLogin: false,
  });
  await expect.poll(() => harness.requests.scheduler.length).toBe(1);
  const schedulerRequestObservedAt = harness.requests.requestTimes.scheduler[0]!;
  await expect(page.getByRole("heading", { name: copy.greeting })).toBeVisible();
  const setupAvailableMs = Date.now() - schedulerRequestObservedAt;
  expect(setupAvailableMs).toBeLessThanOrEqual(1_000);
  await expect(page.getByText(copy.cardPending)).toBeVisible();

  const startCurrentSetup = page.getByRole("button", { name: copy.start });
  await expect(page.getByRole("button", { name: copy.continue })).toHaveCount(0);
  await expect(startCurrentSetup).toBeDisabled();
  expect(harness.requests.sessionStarts).toHaveLength(0);

  await page.getByRole("button", { name: copy.adjust }).click();
  await expect(page.getByRole("heading", { name: copy.setupHeading })).toBeVisible();
  await expect(page.getByRole("slider", { name: copy.rhythm })).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: /Start training|Training starten|Начать тренировку/i,
    }),
  ).toBeDisabled();
  const screenshot = await attachScreenshot(
    page,
    testInfo,
    "setup-while-card-request-pending.png",
  );

  await page.getByRole("button", { name: copy.backToToday }).click();
  await expect(startCurrentSetup).toBeDisabled();
  await expect(startCurrentSetup).toBeEnabled({ timeout: 15_000 });
  const delayedDurationMs = Date.now() - schedulerRequestObservedAt;
  expect(delayedDurationMs).toBeGreaterThanOrEqual(9_000);
  await startCurrentSetup.click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  const schedulerIdentitySummary = summarizeRequestIdentities(
    harness.requests.scheduler,
  );
  expect(schedulerIdentitySummary.repeatedIdentities).toBe(0);
  expect(harness.requests.stats.length).toBeGreaterThanOrEqual(1);
  expect(harness.requests.sessionStarts).toHaveLength(1);
  expectOnlyOwnedSessionSelections(harness.requests.session);
  expect(harness.requests.progressActions).toHaveLength(0);
  expect(harness.requests.progressActionReconciliations).toHaveLength(0);

  await attachMetrics(testInfo, "card-selection-hold-network-metrics.json", {
    schedulerRequestIdentities: schedulerIdentitySummary,
    statsRequests: harness.requests.stats.length,
    sessionStartRequests: harness.requests.sessionStarts.length,
    sessionCardSelectionRequests: harness.requests.session.length,
    progressActionRequests: harness.requests.progressActions.length,
    progressActionReconciliationRequests:
      harness.requests.progressActionReconciliations.length,
    setupAvailableMs,
    delayedDurationMs,
    configuredSchedulerDelayMs: 10_000,
    screenshot,
  });
});

test("Start waits for the selected card's projection while setup stays usable", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  type ProjectionRequestEvent = {
    entryFingerprint: string;
    identityFingerprint: string;
    intent: string | null;
    cardTypeId: string | null;
    contentLanguageCode: string | null;
    translationTargetLanguageCode: string | null;
    requestFields: string[];
    startedAt: number;
    finishedAt?: number;
    outcome?: string;
  };
  const projectionRequestEvents: ProjectionRequestEvent[] = [];
  const eventByRequest = new WeakMap<object, ProjectionRequestEvent>();
  const identityRequestsInFlight = new Map<string, number>();
  const translationRequestTimes: number[] = [];
  let projectionRequestsInFlight = 0;
  let maxConcurrentProjectionRequests = 0;
  let maxConcurrentSameIdentityProjectionRequests = 0;
  await page.addInitScript(() => {
    const browserWindow = window as typeof window & {
      __projectionLookupCallStacks?: string[];
    };
    browserWindow.__projectionLookupCallStacks = [];
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const rawUrl = typeof input === "string" ? input : input instanceof Request ? input.url : "";
      if (rawUrl && new URL(rawUrl, window.location.href).pathname === "/api/platform/v2/lookup") {
        browserWindow.__projectionLookupCallStacks?.push(new Error().stack ?? "");
      }
      return originalFetch(input, init);
    };
  });
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/platform/translation") {
      translationRequestTimes.push(Date.now());
      return;
    }
    if (path !== "/api/platform/v2/lookup") return;
    const body = request.postDataJSON() as Record<string, unknown> | null;
    const event: ProjectionRequestEvent = {
      entryFingerprint:
        typeof body?.entryId === "string"
          ? shortFingerprint(body.entryId)
          : "no-entry-id",
      identityFingerprint: shortFingerprint(JSON.stringify(body ?? {})),
      intent: typeof body?.intent === "string" ? body.intent : null,
      cardTypeId:
        typeof body?.cardTypeId === "string" ? body.cardTypeId : null,
      contentLanguageCode:
        typeof body?.contentLanguageCode === "string"
          ? body.contentLanguageCode
          : null,
      translationTargetLanguageCode:
        typeof body?.translationTargetLanguageCode === "string"
          ? body.translationTargetLanguageCode
          : null,
      requestFields: Object.keys(body ?? {}).sort(),
      startedAt: Date.now(),
    };
    projectionRequestEvents.push(event);
    eventByRequest.set(request, event);
    projectionRequestsInFlight += 1;
    const identityInFlight =
      (identityRequestsInFlight.get(event.identityFingerprint) ?? 0) + 1;
    identityRequestsInFlight.set(event.identityFingerprint, identityInFlight);
    maxConcurrentProjectionRequests = Math.max(
      maxConcurrentProjectionRequests,
      projectionRequestsInFlight,
    );
    maxConcurrentSameIdentityProjectionRequests = Math.max(
      maxConcurrentSameIdentityProjectionRequests,
      identityInFlight,
    );
  });
  const finishProjectionRequest = (request: object, outcome: string) => {
    const event = eventByRequest.get(request);
    if (!event || event.finishedAt !== undefined) return;
    event.finishedAt = Date.now();
    event.outcome = outcome;
    projectionRequestsInFlight -= 1;
    const identityInFlight =
      (identityRequestsInFlight.get(event.identityFingerprint) ?? 1) - 1;
    if (identityInFlight === 0) {
      identityRequestsInFlight.delete(event.identityFingerprint);
    } else {
      identityRequestsInFlight.set(event.identityFingerprint, identityInFlight);
    }
  };
  page.on("requestfinished", (request) =>
    finishProjectionRequest(request, "finished"),
  );
  page.on("requestfailed", (request) =>
    finishProjectionRequest(request, request.failure()?.errorText ?? "failed"),
  );
  const harness = await setupAuthenticatedTrainingAttributionPage(page, 0, {
    lookupDelayMs: 10_000,
    visualProfile: "answer",
    devTestLogin: false,
  });
  await expect.poll(() => harness.requests.projectionLookups.length).toBe(1);
  const projectionRequestObservedAt = harness.requests.requestTimes.projection[0]!;
  await expect(page.getByRole("heading", { name: copy.greeting })).toBeVisible();
  const setupAvailableMs = Date.now() - projectionRequestObservedAt;
  expect(setupAvailableMs).toBeLessThanOrEqual(1_000);
  await expect(page.getByText(copy.cardPending)).toBeVisible();
  const startCurrentSetup = page.getByRole("button", { name: copy.start });
  await expect(page.getByRole("button", { name: copy.continue })).toHaveCount(0);
  await expect(startCurrentSetup).toBeDisabled();
  expect(harness.requests.sessionStarts).toHaveLength(0);
  expect(harness.requests.progressActions).toHaveLength(0);
  const screenshot = await attachScreenshot(
    page,
    testInfo,
    "setup-while-projection-request-pending.png",
  );

  await page.getByRole("button", { name: copy.adjust }).click();
  await expect(page.getByRole("heading", { name: copy.setupHeading })).toBeVisible();
  await expect(page.getByRole("slider", { name: copy.rhythm })).toBeEnabled();
  await expect(
    page.getByRole("button", {
      name: /Start training|Training starten|Начать тренировку/i,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: copy.backToToday }).click();

  await expect(startCurrentSetup).toBeEnabled({ timeout: 15_000 });
  const projectionHeldDurationMs = Date.now() - projectionRequestObservedAt;
  expect(projectionHeldDurationMs).toBeGreaterThanOrEqual(9_000);
  await expect(page.getByText(copy.cardPending)).toBeHidden();
  expect(
    projectionRequestEvents.some(
      (event) =>
        event.entryFingerprint === projectionRequestEvents[0]?.entryFingerprint &&
        event.outcome === "finished",
    ),
  ).toBe(true);
  expect(maxConcurrentProjectionRequests).toBeLessThanOrEqual(1);
  expect(maxConcurrentSameIdentityProjectionRequests).toBeLessThanOrEqual(1);
  expect(translationRequestTimes).toHaveLength(0);
  await startCurrentSetup.click();
  await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
  const projectionIdentitySummary = summarizeRequestIdentities(
    harness.requests.projectionLookups,
  );
  expect(harness.requests.sessionStarts).toHaveLength(1);
  expectOnlyOwnedSessionSelections(harness.requests.session);
  expect(harness.requests.progressActions).toHaveLength(0);
  expect(harness.requests.progressActionReconciliations).toHaveLength(0);

  await attachMetrics(testInfo, "projection-hold-network-metrics.json", {
    projectionRequestIdentities: projectionIdentitySummary,
    projectionRequestEvents: projectionRequestEvents.map((event) => ({
      entryFingerprint: event.entryFingerprint,
      identityFingerprint: event.identityFingerprint,
      intent: event.intent,
      cardTypeId: event.cardTypeId,
      contentLanguageCode: event.contentLanguageCode,
      translationTargetLanguageCode: event.translationTargetLanguageCode,
      requestFields: event.requestFields,
      cacheOwnerScope: "same authenticated dev-test user for this entire scenario",
      startOffsetMs: event.startedAt - projectionRequestObservedAt,
      endOffsetMs:
        event.finishedAt === undefined
          ? null
          : event.finishedAt - projectionRequestObservedAt,
      outcome: event.outcome ?? "pending",
    })),
    maxConcurrentProjectionRequests,
    maxConcurrentSameIdentityProjectionRequests,
    translationRequestCount: translationRequestTimes.length,
    projectionLookupCallStacks: await page.evaluate(() => {
      const browserWindow = window as typeof window & {
        __projectionLookupCallStacks?: string[];
      };
      return browserWindow.__projectionLookupCallStacks ?? [];
    }),
    projectionRequestStartOffsetsMs: harness.requests.requestTimes.projection.map(
      (at) => at - projectionRequestObservedAt,
    ),
    schedulerRequestIdentities: summarizeRequestIdentities(
      harness.requests.scheduler,
    ),
    statsRequests: harness.requests.stats.length,
    sessionStartRequests: harness.requests.sessionStarts.length,
    sessionCardSelectionRequests: harness.requests.session.length,
    progressActionRequests: harness.requests.progressActions.length,
    progressActionReconciliationRequests:
      harness.requests.progressActionReconciliations.length,
    setupAvailableMs,
    projectionHeldDurationMs,
    configuredProjectionDelayMs: 10_000,
    screenshot,
  });
});
