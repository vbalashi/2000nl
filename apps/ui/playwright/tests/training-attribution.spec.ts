import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import {
  buildTrainingAttributionProfileReport,
  installTrainingAttributionCollector,
  readTrainingAttributionCapture,
  setupAuthenticatedTrainingAttributionPage,
  TRAINING_ATTRIBUTION_TRANSITIONS,
  type TrainingAttributionProfileReport,
} from "../support/trainingAttributionHarness";

test.skip(
  process.env.APP_ROLLOUT_PROFILE !== "pilot",
  "Run the attribution harness through npm run test:e2e:training-attribution.",
);

test("authenticated Training transition attribution harness", async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const injectedDelayMs = Number(
    process.env.TRAINING_ATTRIBUTION_INJECT_DELAY_MS ?? 0,
  );
  const stableEvidence =
    process.env.TRAINING_ATTRIBUTION_STABLE_EVIDENCE === "true";
  const profiles = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 },
  ] as const;
  const reports: TrainingAttributionProfileReport[] = [];

  for (const profile of profiles) {
    const page = await browser.newPage({
      viewport: { width: profile.width, height: profile.height },
    });
    await installTrainingAttributionCollector(page);
    const fixture = await setupAuthenticatedTrainingAttributionPage(
      page,
      injectedDelayMs,
      { bootstrapReadDelayMs: 80 },
    );
    const startCurrentSettings = page.getByRole("button", {
      name: /Начать с текущими настройками|Start with current settings|Start met huidige instellingen/i,
    });
    await expect(startCurrentSettings).toBeVisible();
    await startCurrentSettings.click();
    await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
    await page
      .getByRole("button", {
        name: /Закрыть сессию|Close session|Sessie sluiten/i,
      })
      .click();
    const continueSession = page.getByRole("button", {
      name: /Продолжить сессию|Continue session|Sessie voortzetten/i,
    });
    await expect(continueSession).toBeVisible();
    await continueSession.click();
    await expect(page.getByTestId("training-sense-card-v2")).toBeVisible();
    if (!stableEvidence) fixture.beginMeasuredTransitions();

    for (let index = 0; index < TRAINING_ATTRIBUTION_TRANSITIONS; index += 1) {
      const reveal = page.getByRole("button", {
        name: /Antwoord Tonen|Показать ответ|Show answer/i,
      });
      await expect(reveal).toBeVisible();
      await reveal.click();
      const learn = page.getByRole("button", {
        name: /Begin met leren|Учить|Start learning/i,
      });
      if (await learn.isVisible().catch(() => false)) {
        await learn.click();
      } else {
        await page
          .getByRole("button", { name: /Goed|Хорошо|Good/i })
          .click();
      }
      await page.waitForFunction(
        (completed) => {
          const capture = (
            window as typeof window & {
              __trainingAttributionCapture: {
                timings: Array<{ stage: string; outcome: string }>;
              };
            }
          ).__trainingAttributionCapture;
          return (
            capture.timings.filter(
              (event) =>
                event.stage === "transition.total" &&
                (event.outcome === "learn-ready" ||
                  event.outcome === "review-ready"),
            ).length >= completed
          );
        },
        index + 1,
      );
    }

    const capture = await readTrainingAttributionCapture(page);
    reports.push(
      buildTrainingAttributionProfileReport(
        profile,
        capture,
        fixture.requests.scenarios.length,
      ),
    );
    await page.close();
  }

  const expectedVerdict =
    process.env.TRAINING_ATTRIBUTION_EXPECT === "red" ? "red" : "green";
  const verdict = reports.some(
    (report) =>
      report.overThreshold.length > 0 || report.scenarioRequestCount !== 1,
  )
    ? "red"
    : "green";
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
  const relevantPaths = [
    "apps/ui/components/training/TrainingScreen.tsx",
    "apps/ui/components/training/useTrainingTurnSelectionPort.ts",
    "apps/ui/components/training/pilot/useTrainingPilotController.ts",
    "apps/ui/lib/training/selectionService.ts",
    "apps/ui/lib/platform/platformV2ActionService.ts",
    "apps/ui/lib/platform/platformV2TrainingActionClient.ts",
    "apps/ui/playwright/support/trainingAttributionHarness.ts",
    "apps/ui/playwright/tests/training-attribution.spec.ts",
  ];
  const hash = (value: string | Buffer) =>
    createHash("sha256").update(value).digest("hex");
  const relevantSourceSha256 = hash(
    relevantPaths
      .map((path) => `${path}\0${readFileSync(`${repoRoot}/${path}`, "utf8")}\0`)
      .join(""),
  );
  const relevantPatchSha256 = hash(
    execFileSync(
      "git",
      ["diff", "--binary", "HEAD", "--", ...relevantPaths],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    ),
  );
  const report = {
    schemaVersion: "training-transition-attribution-v3",
    appCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    worktreeDirty:
      execFileSync("git", ["status", "--porcelain"], {
        encoding: "utf8",
      }).trim().length > 0,
    thresholdMs: 1_000,
    fixture: {
      transitionCount: TRAINING_ATTRIBUTION_TRANSITIONS,
      injectedTransitionDelayMs: injectedDelayMs,
      injectedBootstrapReadDelayMs: 80,
      workload: stableEvidence ? "stable-selection" : "lifecycle-coverage",
      profiles,
    },
    performanceBudget: {
      acceptedTransitionP95Ms: 1_000,
      acceptedTransitionMaxMs: 1_000,
      scenarioRequestsPerBootstrap: 1,
      unclassifiedOverThreshold: 0,
    },
    identity: {
      relevantPaths,
      relevantSourceSha256,
      relevantPatchSha256,
    },
    expectedVerdict,
    verdict,
    profiles: reports,
  };
  const reportPath = testInfo.outputPath("training-transition-attribution.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  await testInfo.attach("training-transition-attribution.json", {
    path: reportPath,
    contentType: "application/json",
  });

  for (const profile of reports) {
    expect(profile.acceptedTransitions).toBe(TRAINING_ATTRIBUTION_TRANSITIONS);
    expect(profile.actionPaths.learn).toBeGreaterThan(0);
    expect(profile.actionPaths.review).toBeGreaterThan(0);
    expect(profile.acceptedTransitionSummary.count).toBe(
      TRAINING_ATTRIBUTION_TRANSITIONS,
    );
    expect(profile.initialContinue).not.toBeNull();
    expect(
      profile.initialContinue?.visibleStates.some(
        (state) =>
          state.kind === "loading-state" &&
          /laden|loading|загрузка/i.test(state.text),
      ),
    ).toBe(true);
    expect(
      profile.initialContinue?.visibleStates.some(
        (state) =>
          state.kind === "ready-control" &&
          /Antwoord Tonen|Показать ответ|Show answer/i.test(state.text),
      ),
    ).toBe(true);
    expect(profile.prefetchByTransition).toHaveLength(
      TRAINING_ATTRIBUTION_TRANSITIONS,
    );
    if (!stableEvidence) {
      expect(
        profile.prefetchByTransition.every(
          ({ outcomes }) =>
            outcomes.filter((outcome) => outcome === "cancelled").length <= 1 &&
            outcomes.filter((outcome) => outcome === "preparation-cancelled")
              .length <= 1,
        ),
      ).toBe(true);
      expect(
        Object.values(profile.prefetchLifecycleCoverage).every(Boolean),
      ).toBe(true);
    }
    expect(
      stableEvidence
        ? profile.missingRequiredSurfaces.filter(
            (surface) =>
              ![
                "prefetchMiss",
                "prefetchCancel",
                "prefetchFallback",
              ].includes(surface),
          )
        : profile.missingRequiredSurfaces,
    ).toEqual([]);
    expect(profile.unclassifiedOverThreshold).toEqual([]);
    if (expectedVerdict === "green") {
      expect(profile.scenarioRequestCount).toBe(1);
    } else {
      expect(profile.scenarioRequestCount).toBeGreaterThan(0);
    }
    expect(profile.bootstrapReads.auth).not.toBeNull();
    expect(profile.bootstrapReads.independent).toHaveLength(3);
    expect(profile.bootstrapReads.overlapProven).toBe(true);
  }
  if (expectedVerdict === "red") {
    for (const slow of reports.flatMap((profile) => profile.overThreshold)) {
      if (slow.stage !== "transition.total") continue;
      expect(slow.category).not.toBe("end-to-end");
      expect(slow.causalAttribution?.causalCategories).toEqual(
        expect.arrayContaining(["mutation", "selection/scheduler", "network"]),
      );
      expect(slow.causalAttribution?.criticalPathDurationMs).toBeGreaterThanOrEqual(
        1_000,
      );
      expect(slow.causalAttribution?.criticalPathDurationMs).toBeLessThanOrEqual(
        slow.durationMs,
      );
      const path = slow.causalAttribution?.criticalPath ?? [];
      for (let index = 1; index < path.length; index += 1) {
        expect(path[index]?.monotonicStartedAtMs).toBeGreaterThanOrEqual(
          path[index - 1]?.monotonicEndedAtMs ?? 0,
        );
      }
    }
  }
  expect(verdict).toBe(expectedVerdict);
});
