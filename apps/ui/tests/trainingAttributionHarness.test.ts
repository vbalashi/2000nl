import { describe, expect, test } from "vitest";
import {
  buildTrainingAttributionProfileReport,
  type TrainingTimingEvent,
} from "../playwright/support/trainingAttributionHarness";

function timing(stage: string, started: number, ended: number): TrainingTimingEvent {
  return {
    transitionId: "bootstrap",
    stage,
    durationMs: ended - started,
    outcome: "ready",
    recordedAtMs: ended,
    observedAtMs: ended,
    monotonicStartedAtMs: started,
    monotonicEndedAtMs: ended,
  };
}

describe("training attribution bootstrap dependency", () => {
  test("preserves the historical three-way metric while requiring ordered preferences and concurrent training reads", () => {
    const report = buildTrainingAttributionProfileReport(
      { name: "ordered", width: 390, height: 844 },
      {
        timings: [
          timing("auth.session", 0, 10),
          timing("training.preferences", 11, 30),
          timing("training.active-scope-hydration", 40, 70),
          timing("training.scenarios", 42, 72),
        ],
        visibleStates: [],
      },
    );
    expect(report.bootstrapReads).toMatchObject({
      authBeforePreferences: true,
      preferencesBeforeScope: true,
      preferencesBeforeScenarios: true,
      scopeScenariosOverlapMs: 28,
      scopeScenariosOverlapProven: true,
      overlapMs: 0,
      overlapProven: false,
    });
  });

  test("detects a scope read that starts before authoritative preferences finish", () => {
    const report = buildTrainingAttributionProfileReport(
      { name: "premature", width: 390, height: 844 },
      {
        timings: [
          timing("training.preferences", 10, 30),
          timing("training.active-scope-hydration", 20, 50),
          timing("training.scenarios", 21, 51),
        ],
        visibleStates: [],
      },
    );
    expect(report.bootstrapReads.preferencesBeforeScope).toBe(false);
    expect(report.bootstrapReads.scopeScenariosOverlapProven).toBe(true);
  });
});

test("attributes Start scope/session spans to mutations instead of bootstrap hydration", () => {
  const startTiming = (stage: string, started: number, ended: number, outcome = "ready") => ({
    ...timing(stage, started, ended), transitionId: "start-action", outcome,
  });
  const report = buildTrainingAttributionProfileReport(
    { name: "start", width: 390, height: 844 },
    { timings: [
      startTiming("transition.start", 0, 0, "start"),
      startTiming("training.scope-commit", 0, 300),
      startTiming("training.session-start", 300, 900),
      startTiming("next-card.selection", 900, 1100),
      startTiming("preparation.total", 1100, 1200),
      startTiming("card.render", 1200, 1250),
      startTiming("transition.total", 0, 1250, "start-ready"),
    ], visibleStates: [] },
  );
  const total = report.overThreshold.find((event) => event.stage === "transition.total")!;
  expect(total.causalAttribution?.observedCategoryDurations.mutation).toBe(900);
  expect(total.causalAttribution?.observedCategoryDurations.hydration).toBeUndefined();
  expect(total.causalAttribution?.criticalPathDurationMs).toBe(1250);
  expect(total.causalAttribution?.residualMs).toBe(0);
});
