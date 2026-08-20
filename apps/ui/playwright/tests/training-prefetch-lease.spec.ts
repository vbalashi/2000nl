import { expect, test, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import {
  installTrainingAttributionCollector,
  readTrainingAttributionCapture,
  setupAuthenticatedTrainingAttributionPage,
  type TrainingTimingEvent,
} from "../support/trainingAttributionHarness";

test.skip(
  process.env.APP_ROLLOUT_PROFILE !== "pilot",
  "Run this lease check with APP_ROLLOUT_PROFILE=pilot.",
);

const PRODUCTION_SYMPTOM_BUDGET_MS = 400;

async function waitForPreparedCount(page: Page, count: number) {
  await page.waitForFunction(
    (minimum) => {
      const capture = (
        window as typeof window & {
          __trainingAttributionCapture: {
            timings: Array<{
              transitionId: string;
              stage: string;
              outcome: string;
            }>;
          };
        }
      ).__trainingAttributionCapture;
      const selected = new Set(
        capture.timings
          .filter(
            (event) =>
              event.stage === "next-card.selection" && event.outcome === "ready",
          )
          .map((event) => event.transitionId),
      );
      return capture.timings.filter(
        (event) =>
          event.stage === "preparation.total" &&
          selected.has(event.transitionId),
      ).length >= minimum;
    },
    count,
  );
}

async function acceptCurrentCard(page: Page) {
  const reveal = page.getByRole("button", {
    name: /Antwoord Tonen|Показать ответ|Show answer/i,
  });
  await reveal.click();
  const learn = page.getByRole("button", {
    name: /Begin met leren|Учить|Start learning/i,
  });
  if (await learn.isVisible().catch(() => false)) {
    await learn.click();
  } else {
    await page.getByRole("button", { name: /Goed|Хорошо|Good/i }).click();
  }
}

async function readEventsAfter(
  page: Page,
  eventCount: number,
): Promise<TrainingTimingEvent[]> {
  const capture = await readTrainingAttributionCapture(page);
  return capture.timings.slice(eventCount);
}

test("prepared card lease survives immediate and delayed answers", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);
  const samples: Array<{
    profile: string;
    case: "immediate" | "delayed";
    durationMs: number;
    prefetchOutcomes: string[];
  }> = [];
  for (const profile of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ] as const) {
    const page = await browser.newPage({
      viewport: { width: profile.width, height: profile.height },
    });
    await installTrainingAttributionCollector(page);
    await page.addInitScript(() => {
      const realDateNow = Date.now.bind(Date);
      const clock = window as typeof window & {
        __trainingLeaseClockOffsetMs?: number;
      };
      clock.__trainingLeaseClockOffsetMs = 0;
      Date.now = () =>
        realDateNow() + (clock.__trainingLeaseClockOffsetMs ?? 0);
    });
    await setupAuthenticatedTrainingAttributionPage(page, 0, {
      lookupDelayMs: 250,
      actionDelayMs: 250,
      advanceLeaseClockMs: 29_000,
      advanceLeaseClockOnAction: 2,
      abortFirstActionAfterMs: 80,
      abortActionNumber: 2,
      reconcileDelayMs: 80,
    });

    await page
      .getByRole("button", {
        name: /Начать с текущими настройками|Start with current settings|Start met huidige instellingen/i,
      })
      .click();
    await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
    await waitForPreparedCount(page, 1);
    await page.waitForTimeout(350);

    let capture = await readTrainingAttributionCapture(page);
    const immediateStart = capture.timings.length;
    await acceptCurrentCard(page);
    await page.waitForFunction(
      (start) => {
        const timings = (
          window as typeof window & {
            __trainingAttributionCapture: { timings: TrainingTimingEvent[] };
          }
        ).__trainingAttributionCapture.timings;
        return timings
          .slice(start)
          .some(
            (event) =>
              event.stage === "transition.total" &&
              /^(learn|review)-ready$/.test(event.outcome),
          );
      },
      immediateStart,
    );
    const immediateEvents = await readEventsAfter(page, immediateStart);
    const immediateDuration = immediateEvents.find(
      (event) => event.stage === "transition.total",
    )?.durationMs;
    expect(immediateDuration).toBeDefined();
    expect(
      immediateDuration,
    ).toBeLessThan(PRODUCTION_SYMPTOM_BUDGET_MS);
    samples.push({
      profile: profile.name,
      case: "immediate",
      durationMs: immediateDuration!,
      prefetchOutcomes: immediateEvents
        .filter((event) => event.stage === "next-card.prefetch")
        .map((event) => event.outcome),
    });

    await waitForPreparedCount(page, 2);
    await page.waitForTimeout(350);
    await page.getByRole("button", {
      name: /Antwoord Tonen|Показать ответ|Show answer/i,
    }).click();
    await page.evaluate(() => {
      const clock = window as typeof window & {
        __trainingLeaseClockOffsetMs?: number;
      };
      clock.__trainingLeaseClockOffsetMs = 2_000;
    });
    await page.evaluate(async () => {
      let markHeld!: () => void;
      const held = new Promise<void>((resolve) => {
        markHeld = resolve;
      });
      void navigator.locks.request(
        "lock:sb-localhost-auth-token",
        async () => {
          const timingWindow = window as typeof window & {
            __trainingAuthLockTiming?: { heldAt: number; releasedAt?: number };
          };
          timingWindow.__trainingAuthLockTiming = {
            heldAt: performance.now(),
          };
          markHeld();
          await new Promise((resolve) => window.setTimeout(resolve, 100));
          timingWindow.__trainingAuthLockTiming.releasedAt = performance.now();
        },
      );
      await held;
    });
    capture = await readTrainingAttributionCapture(page);
    const delayedStart = capture.timings.length;
    const learn = page.getByRole("button", {
      name: /Begin met leren|Учить|Start learning/i,
    });
    if (await learn.isVisible().catch(() => false)) {
      await learn.click();
    } else {
      await page.getByRole("button", { name: /Goed|Хорошо|Good/i }).click();
    }
    await page.waitForFunction(
      (start) => {
        const timings = (
          window as typeof window & {
            __trainingAttributionCapture: { timings: TrainingTimingEvent[] };
          }
        ).__trainingAttributionCapture.timings;
        return timings
          .slice(start)
          .some(
            (event) =>
              event.stage === "transition.total" &&
              /^(learn|review)-ready$/.test(event.outcome),
          );
      },
      delayedStart,
    );
    const delayedEvents = await readEventsAfter(page, delayedStart);
    expect(
      await page.evaluate(() => {
        const clock = window as typeof window & {
          __trainingLeaseClockOffsetMs?: number;
        };
        return clock.__trainingLeaseClockOffsetMs;
      }),
      `${profile.name}: the action must cross the original 30s lease boundary`,
    ).toBe(31_000);
    expect(
      delayedEvents.some(
        (event) =>
          event.stage === "next-card.prefetch" &&
          event.outcome === "renewal-required",
      ),
      `${profile.name}: the near-boundary lease was incorrectly reused`,
    ).toBe(true);
    expect(
      delayedEvents.some(
        (event) =>
          event.stage === "next-card.prefetch" && event.outcome === "expired",
      ),
      `${profile.name}: renewed preparation expired during the action window`,
    ).toBe(false);
    expect(delayedEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: "review.mutation.request",
          outcome: "attempt-1-transport-error",
        }),
        expect.objectContaining({
          stage: "review.reconciliation.request",
          outcome: "reconcile-http-200",
        }),
      ]),
    );
    expect(
      await page.evaluate(() => {
        const timing = (
          window as typeof window & {
            __trainingAuthLockTiming?: {
              heldAt: number;
              releasedAt?: number;
            };
          }
        ).__trainingAuthLockTiming;
        return timing?.releasedAt ? timing.releasedAt - timing.heldAt : 0;
      }),
      `${profile.name}: auth acquisition delay was not exercised`,
    ).toBeGreaterThanOrEqual(90);
    const delayedOutcomes = delayedEvents
      .filter((event) => event.stage === "next-card.prefetch")
      .map((event) => event.outcome);
    expect(delayedOutcomes.indexOf("renewal-ready")).toBeLessThan(
      delayedOutcomes.indexOf("accepted-hit-ready"),
    );
    expect(
      delayedEvents.some(
        (event) =>
          event.stage === "next-card.prefetch" &&
          event.outcome === "proactive-refresh-ready",
      ),
      `${profile.name}: expired preparation was not refreshed alongside the action`,
    ).toBe(true);
    const delayedDuration = delayedEvents.find(
      (event) => event.stage === "transition.total",
    )?.durationMs;
    expect(delayedDuration).toBeDefined();
    expect(delayedDuration).toBeLessThan(PRODUCTION_SYMPTOM_BUDGET_MS);
    expect(
      [...immediateEvents, ...delayedEvents].filter(
        (event) => event.durationMs >= 1_000,
      ),
    ).toEqual([]);
    samples.push({
      profile: profile.name,
      case: "delayed",
      durationMs: delayedDuration!,
      prefetchOutcomes: delayedEvents
        .filter((event) => event.stage === "next-card.prefetch")
        .map((event) => event.outcome),
    });
    await page.close();
  }

  const summarize = (values: number[]) => {
    const sorted = [...values].sort((left, right) => left - right);
    const percentile = (ratio: number) =>
      sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)]!;
    return {
      count: sorted.length,
      p50: percentile(0.5),
      p95: percentile(0.95),
      max: sorted.at(-1)!,
    };
  };
  const evidence = {
    schemaVersion: "training-prefetch-lease-v1",
    syntheticDelaysMs: { action: 250, lookup: 250 },
    leaseClockAdvanceMs: 31_000,
    budgetMs: PRODUCTION_SYMPTOM_BUDGET_MS,
    immediate: summarize(
      samples
        .filter((sample) => sample.case === "immediate")
        .map((sample) => sample.durationMs),
    ),
    delayed: summarize(
      samples
        .filter((sample) => sample.case === "delayed")
        .map((sample) => sample.durationMs),
    ),
    samples,
  };
  const evidencePath = testInfo.outputPath("training-prefetch-lease.json");
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2), "utf8");
  await testInfo.attach("training-prefetch-lease.json", {
    path: evidencePath,
    contentType: "application/json",
  });
});
