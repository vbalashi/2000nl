import { describe, expect, test } from "vitest";
import {
  buildTrainingAttributionProfileReport,
  installCurrentTrainingCardFixture,
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

test("current-card fixture grants only explicit, version-bound displays and reads one exact entry", async () => {
  let handler!: (route: import("@playwright/test").Route) => Promise<unknown>;
  const group = (await import("./platformV2LibraryFixture")).multiSenseBankGroup;
  const source = group.entries.find(entry => entry.kind === "sense-card")!;
  if (source.kind !== "sense-card") throw new Error("fixture missing sense");
  const fixtureGroup = { ...group, entries: group.entries.map(entry => entry.kind === "sense-card" ? { ...entry, sourceVersion: 1 } : entry) };
  const page = { route: async (_pattern: string, callback: typeof handler) => { handler = callback; } } as unknown as import("@playwright/test").Page;
  const fixture = await installCurrentTrainingCardFixture(page, { sessionId: "run", resolveGroup: id => fixtureGroup.entries.some(entry => entry.kind === "sense-card" && entry.entryId === id) ? fixtureGroup : undefined });
  expect(fixture.acknowledgements).toEqual([]);
  const call = async (body: Record<string, unknown>) => {
    let response!: { status?: number; json: Record<string, unknown> };
    await handler({ request: () => ({ method: () => "POST", postDataJSON: () => body }), fulfill: async (value: typeof response) => { response = value; } } as unknown as import("@playwright/test").Route);
    return response;
  };
  const ack = { operation: "acknowledge", sessionId: "run", entryId: source.entryId, cardTypeId: "word-to-definition", sourceVersion: 1, stateRevision: source.card?.stateRevision ?? "untracked" };
  expect((await call({ ...ack, sourceVersion: 2 })).status).toBe(409);
  expect((await call({ ...ack, sessionId: "other-run" })).status).toBe(409);
  const granted = await call(ack);
  expect(fixture.acknowledgements).toEqual([ack]);
  const read = { operation: "read", sessionId: "run", entryId: source.entryId, cardTypeId: "word-to-definition", permitId: granted.json.permitId, contentLanguageCode: "nl", translationTargetLanguageCode: null };
  expect((await call({ ...read, permitId: "unissued" })).status).toBe(409);
  expect((await call({ ...read, entryId: "another-entry" })).status).toBe(409);
  const result = await call(read);
  expect(result.json.groups).toEqual([{ ...fixtureGroup, entries: [{ ...source, sourceVersion: 1 }], senseCount: 1, entryCount: 1 }]);
  expect(fixture.reads).toEqual([read]);
});
