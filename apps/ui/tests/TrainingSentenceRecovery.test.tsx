import React from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { TrainingSentenceSession } from "@/components/training/pilot/TrainingSentenceSession";
import { fetchNextPlatformV2TranslationTrainingSessionExercise } from "@/lib/platform/platformV2TranslationExerciseClient";
import { loadSentenceExerciseContent } from "@/lib/training/sentenceExerciseLoader";
import { subscribeAppEvents, appTranslationTopic } from "@/lib/events/appEvents";
import { goedGroup } from "./platformV2IdiomHierarchyFixture";
const transport = vi.hoisted(() => ({
  joins: [] as { topic: string; event: (payload: unknown) => void; state: (status: "connecting" | "connected" | "degraded") => void; stopped: boolean }[],
  connected: true,
}));
// Replace only external delivery; retain production recovery, events and registry.
vi.mock("@/lib/events/appEvents", async () => {
  const actual = await import("@/lib/events/appEventRegistry");
  const registry = actual.createAppEventRegistry({ connect(topic, event, state) {
    const join = { topic, event, state, stopped: false }; transport.joins.push(join);
    queueMicrotask(() => { if (!join.stopped) state(transport.connected ? "connected" : "degraded"); });
    return () => { join.stopped = true; };
  }});
  return { ...actual, subscribeAppEvents: registry.subscribe, subscribeAppEventConnection: registry.subscribeConnection };
});
vi.mock("@/lib/platform/platformV2TranslationExerciseClient", () => ({ fetchNextPlatformV2TranslationTrainingSessionExercise: vi.fn(), markPlatformV2TranslationTrainingSessionMemberUnavailable: vi.fn(), performPlatformV2TranslationExerciseAction: vi.fn() }));
vi.mock("@/lib/platform/platformV2LibraryClient", () => ({ requestPlatformV2LibraryTranslation: vi.fn().mockResolvedValue("pending") }));
vi.mock("@/lib/training/sentenceExerciseLoader", () => ({ loadSentenceExerciseContent: vi.fn(), prepareSentenceExerciseTranslation: vi.fn() }));
vi.mock("@/lib/training/translationStatsClient", () => ({ readTranslationTrainingStats: vi.fn().mockResolvedValue({ reviewCardsDone: 0, reviewCardsDue: 0, newCardsToday: 0, totalCardsStarted: 0, totalCardsInScope: 1 }) }));
vi.mock("@/components/training/useRecordedStudyTime", () => ({ useRecordedStudyTime: vi.fn() }));
const session = { contractVersion: "platform-translation-exercise-session-v1" as const, sessionId: "sentence-session", exerciseFamily: "translation" as const, direction: "recall" as const, sessionSize: "1", requestedTotal: 1, plannedNew: 1, plannedReview: 0, plannedPractice: 0 as const, plannedTotal: 1, plannedAt: "2026-09-24T12:00:00Z", runStatus: "active" as const, runGeneration: 1, completedActions: 0, completionReason: null, members: [] };
const candidate = { status: "ready" as const, sessionId: session.sessionId, ordinal: 1, targetId: "target-sentence", targetKey: "translation:target-sentence", family: "translation" as const, direction: "recall" as const, entryId: "11111111-1111-4111-8111-111111111111", contentNodeId: "idiom-example-goed", sourcePath: "raw.meanings[0].examples[0]", sourceRevision: "rev-1", sourceTextFingerprint: "fingerprint-idiom-example-goed", queueSource: "new" as const, state: null };
const content = (() => {
  const group = structuredClone(goedGroup);
  const entry = group.entries.find((item) => item.kind === "sense-card")!;
  const sentence = entry.contentNodes.find((node) => node.contentNodeId === candidate.contentNodeId)!;
  sentence.translations = [{ translationId: "translation-1", targetLanguageCode: "ru", status: "ready", text: "Переведённый пример.", sourceTextFingerprint: sentence.sourceTextFingerprint, translationPolicyVersion: "v1" }];
  return { group, entry, sentence };
})();


async function settle() { for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); }); }
const view = (overrides: Partial<React.ComponentProps<typeof TrainingSentenceSession>> = {}) => <TrainingSentenceSession userId="user-1" session={session} contentLanguageCode="nl" translationTargetLanguageCode="ru" interfaceLanguage="en" onExit={vi.fn()} {...overrides} />;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); transport.joins.length = 0; transport.connected = true;
  vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mockResolvedValue(candidate);
  vi.mocked(loadSentenceExerciseContent).mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 5));
    return { state: "translation-pending" };
  });
});
afterEach(() => { cleanup(); Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" }); vi.useRealTimers(); });
test("pending sentence does not rejoin or reload itself after initial reconciliation", async () => {
  render(view()); await settle();
  for (let i = 0; i < 10; i++) { await act(async () => { await vi.advanceTimersByTimeAsync(5); }); await settle(); }
  expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(2);
  expect(screen.getByText("Translation is being prepared…")).toBeVisible();
  expect(transport.joins).toHaveLength(1);
});

async function tick(ms = 5) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); await settle(); }
async function pending() { await settle(); await tick(); await tick(); }
function hint(language = "ru", entryId = candidate.entryId) {
  const join = [...transport.joins].reverse().find(item => !item.stopped)!;
  join.event({ version: 1, eventId: crypto.randomUUID(), kind: "translation.ready", occurredAt: "2026-10-17T12:00:00Z", resourceId: entryId, language });
}
test("ready hint recovers the selected member and late reconnect does not replace a ready card", async () => {
  render(view()); await pending();
  vi.mocked(loadSentenceExerciseContent).mockResolvedValue({ state: "ready", content } as never);
  await act(async () => hint()); await settle();
  expect(screen.getByText("Переведённый пример.")).toBeVisible();
  const calls = vi.mocked(loadSentenceExerciseContent).mock.calls.length;
  await act(async () => { transport.joins[0].state("degraded"); transport.joins[0].state("connected"); transport.joins[0].event({}); }); await settle();
  expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(calls);
  expect(screen.getByText("Переведённый пример.")).toBeVisible();
});
test("reconnect reconciles once and hints during an in-flight read coalesce without cancellation", async () => {
  render(view()); await pending();
  await act(async () => { transport.joins[0].state("degraded"); transport.joins[0].state("connected"); }); await settle();
  const signal = vi.mocked(loadSentenceExerciseContent).mock.lastCall![0].signal;
  await act(async () => { hint(); hint(); hint(); });
  expect(signal?.aborted).toBe(false);
  expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(3);
  await tick(); await tick();
  expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(4);
  expect(transport.joins).toHaveLength(1);
});
test("degraded fallback is sparse, pauses hidden, and recovers on visible focus beyond five minutes", async () => {
  transport.connected = false; render(view()); await pending();
  expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(1);
  await tick(3_000); expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(1);
  await tick(57_000); await tick(); expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  await tick(300_000); expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  vi.mocked(loadSentenceExerciseContent).mockResolvedValue({ state: "ready", content } as never);
  await act(async () => window.dispatchEvent(new Event("focus"))); await settle();
  expect(screen.getByText("Переведённый пример.")).toBeVisible();
});
test.each(["completed", "exhausted", "superseded"] as const)("%s response ends pending recovery", async status => {
  const superseded = vi.fn(); render(view({ onSessionSuperseded: superseded })); await pending();
  vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mockResolvedValue({ status, sessionId: session.sessionId, completedActions: 1, requestedTotal: 1 } as never);
  await act(async () => hint()); await settle();
  const calls = vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mock.calls.length;
  await tick(900_000);
  expect(fetchNextPlatformV2TranslationTrainingSessionExercise).toHaveBeenCalledTimes(calls);
  expect(transport.joins[0].stopped).toBe(true);
  if (status === "superseded") expect(superseded).toHaveBeenCalledOnce();
  else expect(screen.getByText("Session complete")).toBeVisible();
});
test.each(["owner", "session", "generation", "language"] as const)("changing %s aborts old recovery and fences late hints/results", async change => {
  const rendered = render(view()); await pending();
  let resolve!: (value: Awaited<ReturnType<typeof loadSentenceExerciseContent>>) => void;
  vi.mocked(loadSentenceExerciseContent).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => hint()); await settle();
  const signal = vi.mocked(loadSentenceExerciseContent).mock.lastCall![0].signal;
  const overrides = change === "owner" ? { userId: "user-2" } : change === "session" ? { session: { ...session, sessionId: "other-session" } } : change === "generation" ? { session: { ...session, runGeneration: 2 } } : { translationTargetLanguageCode: "en" };
  rendered.rerender(view(overrides)); await pending();
  expect(signal?.aborted).toBe(true);
  expect(transport.joins[0].stopped).toBe(true);
  const calls = vi.mocked(loadSentenceExerciseContent).mock.calls.length;
  await act(async () => { transport.joins[0].state("connected"); transport.joins[0].event({ version: 1, eventId: crypto.randomUUID(), kind: "translation.ready", occurredAt: "2026-10-17T12:00:00Z", resourceId: candidate.entryId, language: "ru" }); resolve({ state: "ready", content } as never); }); await settle();
  expect(screen.queryByText("Переведённый пример.")).not.toBeInTheDocument();
  expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(calls);
});

test("healthy fallback waits fifteen minutes and wrong entry/language hints cannot refresh", async () => {
  render(view()); await pending();
  await act(async () => { hint("en"); hint("ru", "22222222-2222-4222-8222-222222222222"); }); await settle();
  await tick(60_000); expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(2);
  await tick(840_000); await tick(); expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(3);
  expect(transport.joins).toHaveLength(1);
});
test("authoritative member change replaces entry subscription and unmount aborts its in-flight read", async () => {
  const rendered = render(view()); await pending();
  const other = { ...candidate, entryId: "22222222-2222-4222-8222-222222222222", targetId: "other-target" };
  vi.mocked(fetchNextPlatformV2TranslationTrainingSessionExercise).mockResolvedValue(other);
  await act(async () => hint()); await tick(); await tick();
  expect(transport.joins[0].stopped).toBe(true);
  expect(transport.joins[1].topic).toContain(other.entryId);
  await act(async () => hint("ru", other.entryId)); await settle();
  const signal = vi.mocked(loadSentenceExerciseContent).mock.lastCall![0].signal;
  rendered.unmount(); expect(signal?.aborted).toBe(true);
  await tick(); expect(transport.joins[1].stopped).toBe(true);
});

test("ready hint during an older pending read is recovered by the single trailing read", async () => {
  render(view()); await pending();
  let resolve!: (value: Awaited<ReturnType<typeof loadSentenceExerciseContent>>) => void;
  vi.mocked(loadSentenceExerciseContent).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await act(async () => hint()); await settle();
  vi.mocked(loadSentenceExerciseContent).mockResolvedValue({ state: "ready", content } as never);
  await act(async () => { hint(); hint(); resolve({ state: "translation-pending" }); }); await settle();
  expect(screen.getByText("Переведённый пример.")).toBeVisible();
  expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(4);
  expect(transport.joins).toHaveLength(1);
});

test("translation failure ends automatic pending reads and leaves explicit retry available", async () => {
  render(view()); await pending();
  vi.mocked(loadSentenceExerciseContent).mockResolvedValue({ state: "translation-unavailable" });
  await act(async () => hint()); await settle();
  expect(screen.getByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
  await tick(900_000);
  expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(3);
  expect(transport.joins[0].stopped).toBe(true);
});

test("an already-connected topic retained by another reader still reconciles only once", async () => {
  const stop = subscribeAppEvents({ topic: appTranslationTopic(candidate.entryId, "ru") }, () => {});
  try {
    await settle(); render(view()); await pending();
    for (let i = 0; i < 8; i++) await tick();
    expect(loadSentenceExerciseContent).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Translation is being prepared…")).toBeVisible();
    expect(transport.joins).toHaveLength(1);
  } finally { cleanup(); stop(); }
});
