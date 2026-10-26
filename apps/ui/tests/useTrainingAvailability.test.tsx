import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
const { load } = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("@/lib/training/availability/client", () => ({ fetchTrainingAvailability: load }));
vi.mock("@/lib/supabaseClient", () => ({ supabase: { rpc: vi.fn() } }));
vi.mock("@/lib/platform/platformV2Http", () => ({ platformV2AuthenticatedJsonHeaders: vi.fn(async () => ({})) }));
vi.mock("@/lib/platform/platformFetchWithTimeout", () => ({ platformFetchWithTimeout: vi.fn() }));
import { platformFetchWithTimeout } from "@/lib/platform/platformFetchWithTimeout";
import { performPlatformV2IdiomExerciseAction } from "@/lib/platform/platformV2IdiomExerciseClient";
import { useTrainingAvailability, clearTrainingAvailabilityCache } from "@/lib/training/availability/useTrainingAvailability";
import { availabilityRecipeKey, currentAvailabilityStudyDay, type TrainingAvailabilityRecipe } from "@/lib/training/availability/model";
import { publishPlatformV2CardStateChanged } from "@/lib/platform/platformV2CardStateChanges";
const recipe = (family: "meaning" | "word-in-context" = "meaning"): TrainingAvailabilityRecipe => ({ languageCode: "nl", draft: { family, scenarioId: "understanding", modes: [family === "meaning" ? "word-to-definition" : "definition-to-word"], cardFilter: "review", listValue: "", materialMode: "all-dictionaries", newReviewRatio: 50, dateWindow: "all", sourceValue: "all", sessionSize: 5 } });
const value = (count = 2) => ({ dueToday: count, totalReviews: 10, newCards: 5, timezone: "Europe/Amsterdam", studyDay: currentAvailabilityStudyDay("Europe/Amsterdam"), asOf: new Date().toISOString() });
beforeEach(() => { vi.clearAllMocks(); clearTrainingAvailabilityCache(); load.mockResolvedValue(value()); });
test("only selected recipe is fetched and equivalent display options reuse cache", async () => {
  const a = recipe(); const { result, rerender, unmount } = renderHook(({ r }) => useTrainingAvailability({ ownerId: "owner", recipe: r }), { initialProps: { r: a } });
  await waitFor(() => expect(result.current.status).toBe("ready")); rerender({ r: { ...a, draft: { ...a.draft, sessionSize: 50, cardFilter: "new", newReviewRatio: 20 } } }); expect(load).toHaveBeenCalledTimes(1); unmount();
  const next = renderHook(() => useTrainingAvailability({ ownerId: "owner", recipe: a })); await waitFor(() => expect(next.result.current.status).toBe("ready")); expect(load).toHaveBeenCalledTimes(1);
});
test("cancels and ignores stale rapid selection responses", async () => {
  let finish!: (x: ReturnType<typeof value>) => void; load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(value(3));
  const { result, rerender } = renderHook(({ r }) => useTrainingAvailability({ ownerId: "owner", recipe: r }), { initialProps: { r: recipe() } });
  const signal = load.mock.calls[0][2]; rerender({ r: recipe("word-in-context") }); expect(signal.aborted).toBe(true); await waitFor(() => expect(result.current.status).toBe("ready")); await act(async () => finish(value(1))); expect(result.current).toMatchObject({ value: { dueToday: 3 } });
});
test("invalidates accepted ordinary actions and prevents previous owner data", async () => {
  const { result, rerender } = renderHook(({ owner }) => useTrainingAvailability({ ownerId: owner, recipe: recipe() }), { initialProps: { owner: "a" } }); await waitFor(() => expect(result.current.status).toBe("ready"));
  act(() => publishPlatformV2CardStateChanged("entry")); await waitFor(() => expect(load).toHaveBeenCalledTimes(2)); let finish!: (x: ReturnType<typeof value>) => void; load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })); rerender({ owner: "b" }); expect(result.current.status).toBe("loading"); await act(async () => finish(value(4))); expect(result.current).toMatchObject({ value: { dueToday: 4 } });
});
test("disabled does not request and failed reads do not become fabricated zeros", async () => {
  const { result, rerender } = renderHook(({ enabled }) => useTrainingAvailability({ ownerId: "a", recipe: recipe(), enabled }), { initialProps: { enabled: false } }); expect(result.current.status).toBe("idle"); expect(load).not.toHaveBeenCalled(); load.mockRejectedValue(new Error("failed")); rerender({ enabled: true }); await waitFor(() => expect(result.current.status).toBe("error")); expect(result.current).not.toHaveProperty("value");
});
test("caller revision and reload refresh without polling", async () => {
  const { result, rerender } = renderHook(({ refresh }) => useTrainingAvailability({ ownerId: "a", recipe: recipe(), refresh }), { initialProps: { refresh: 0 } }); await waitFor(() => expect(result.current.status).toBe("ready")); rerender({ refresh: 1 }); await waitFor(() => expect(load).toHaveBeenCalledTimes(2)); act(() => result.current.reload()); await waitFor(() => expect(load).toHaveBeenCalledTimes(3));
});
test("local04:00study-day handlesDST and contextual recipes have distinctkeys", () => {
  expect(currentAvailabilityStudyDay("Europe/Amsterdam", new Date("2026-10-03T01:59:59Z"))).toBe("2026-10-02"); expect(currentAvailabilityStudyDay("Europe/Amsterdam", new Date("2026-10-03T02:00:00Z"))).toBe("2026-10-03"); expect(currentAvailabilityStudyDay("Europe/Amsterdam", new Date("2026-10-25T02:59:59Z"))).toBe("2026-10-24"); expect(availabilityRecipeKey(recipe())).not.toBe(availabilityRecipeKey(recipe("word-in-context")));
});

test("freshness expiry keeps the same recipe values during revalidation", async () => {
  const now = Date.now(); const clock = vi.spyOn(Date, "now").mockReturnValue(now);
  const first = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: recipe() })); await waitFor(() => expect(first.result.current.status).toBe("ready")); first.unmount(); clock.mockReturnValue(now + 61000);
  let finish!: (x: ReturnType<typeof value>) => void; load.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const next = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: recipe() })); expect(next.result.current).toMatchObject({ status: "ready", refreshing: true, value: { dueToday: 2 } }); await act(async () => finish(value(3))); expect(next.result.current).toMatchObject({ value: { dueToday: 3 }, refreshing: false }); clock.mockRestore();
});
test("focus across local study-day rollover requests current counts without polling", async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-03T01:59:59Z")); load.mockImplementation(() => Promise.resolve(value()));
  const { result } = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: recipe() })); await waitFor(() => expect(result.current.status).toBe("ready")); expect(load).toHaveBeenCalledTimes(1);
  vi.setSystemTime(new Date("2026-10-03T02:00:01Z")); act(() => window.dispatchEvent(new Event("focus"))); await waitFor(() => expect(load).toHaveBeenCalledTimes(2)); await waitFor(() => expect(result.current).toMatchObject({ status: "ready", value: { studyDay: "2026-10-03" } })); vi.useRealTimers();
});


test("accepted ordinary grades invalidate cache while overview is unmounted", async () => {
  const first = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: recipe() })); await waitFor(() => expect(first.result.current.status).toBe("ready")); first.unmount();
  publishPlatformV2CardStateChanged("entry"); const second = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: recipe() })); await waitFor(() => expect(second.result.current.status).toBe("ready")); expect(load).toHaveBeenCalledTimes(2);
});
const idiomInput = { trainingSessionId: "session", clientEventId: "event", candidate: { targetId: "target", targetKey: "idiom:target:direct", direction: "direct" as const, state: null }, reviewResult: "success" as const };
const idiomReceipt = () => ({ contractVersion: "platform-action-v2", actionId: "review-exercise", clientEventId: "event", accepted: true, exercise: { targetId: "target", targetKey: "idiom:target:direct", family: "idiom", direction: "direct", state: { stateRevision: "revision", fsrsReps: 1, fsrsLapses: 0, seenCount: 1, successCount: 1, fsrsEnabled: true, hidden: false, inLearning: false, lastResult: "success" } } });
test("accepted idiom grade invalidates immediately on same-recipe remount", async () => {
  const r = { ...recipe(), draft: { ...recipe().draft, family: "idiom" as const, scenarioId: "idiom" } };
  const first = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: r })); await waitFor(() => expect(first.result.current.status).toBe("ready")); first.unmount();
  vi.mocked(platformFetchWithTimeout).mockResolvedValue(Response.json(idiomReceipt())); await performPlatformV2IdiomExerciseAction(idiomInput);
  const second = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: r })); await waitFor(() => expect(second.result.current.status).toBe("ready")); expect(load).toHaveBeenCalledTimes(2);
});
test("failed or invalid idiom response preserves cached availability", async () => {
  const r = recipe(); const first = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: r })); await waitFor(() => expect(first.result.current.status).toBe("ready")); first.unmount();
  vi.mocked(platformFetchWithTimeout).mockResolvedValue(Response.json({ error: "denied" }, { status: 403 })); await expect(performPlatformV2IdiomExerciseAction(idiomInput)).rejects.toThrow();
  vi.mocked(platformFetchWithTimeout).mockResolvedValue(Response.json({ ...idiomReceipt(), accepted: false })); await expect(performPlatformV2IdiomExerciseAction(idiomInput)).rejects.toThrow();
  const second = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: r })); await waitFor(() => expect(second.result.current.status).toBe("ready")); expect(load).toHaveBeenCalledTimes(1);
});
test("accepted idiom grade refreshes a mounted overview and discards in-flight stale read", async () => {
  let resolveFirst!: (v: ReturnType<typeof value>) => void;
  load.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; })).mockResolvedValueOnce(value(4));
  const { result } = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: recipe() }));
  vi.mocked(platformFetchWithTimeout).mockResolvedValue(Response.json(idiomReceipt()));
  await act(async () => { await performPlatformV2IdiomExerciseAction(idiomInput); resolveFirst(value(1)); });
  await waitFor(() => expect(result.current).toMatchObject({ status: "ready", value: { dueToday: 4 } })); expect(load).toHaveBeenCalledTimes(2);
});
test("fresh counts fetched after a grade survive immediate overview remount", async () => {
  const first = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: recipe() })); await waitFor(() => expect(first.result.current.status).toBe("ready"));
  load.mockResolvedValueOnce(value(4)); vi.mocked(platformFetchWithTimeout).mockResolvedValue(Response.json(idiomReceipt())); await act(async () => { await performPlatformV2IdiomExerciseAction(idiomInput); }); await waitFor(() => expect(first.result.current).toMatchObject({ value: { dueToday: 4 } })); first.unmount();
  const second = renderHook(() => useTrainingAvailability({ ownerId: "a", recipe: recipe() })); await waitFor(() => expect(second.result.current).toMatchObject({ value: { dueToday: 4 } })); expect(load).toHaveBeenCalledTimes(2);
});
