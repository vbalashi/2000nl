import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
const { request, snapshot } = vi.hoisted(() => ({ request: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/lib/platform/platformV2LibraryClient", () => ({ requestPlatformV2LibraryTranslation: request }));
vi.mock("@/lib/training/selectionService", () => ({ fetchTrainingSessionSnapshot: snapshot }));
import { selectTranslationBufferMembers, useLatchedTranslationBuffer } from "@/components/training/v2/useLatchedTranslationBuffer";
import { recordTranslationPreparationDuration, translationBufferDepth } from "@/lib/translation/translationPreparationTiming";
const member = (ordinal: number, entryId = `entry-${ordinal}`) => ({ ordinal, entryId, consumedAt: null, unavailableAt: null });
beforeEach(() => { request.mockReset().mockResolvedValue("pending"); snapshot.mockReset(); });
test("selects only future available latched entries, deduplicated and capped", () => {
  expect(selectTranslationBufferMembers([
    member(7), member(1), { ...member(2), consumedAt: "done" },
    { ...member(3), unavailableAt: "unavailable" }, member(4), member(5, "entry-4"), member(6), member(8),
  ], 1, 99).map(item => item.ordinal)).toEqual([4, 6, 7]);
});
test("pace and observed translation latency affect depth within the cap", () => {
  recordTranslationPreparationDuration(120_000);
  expect(translationBufferDepth(5_000)).toBe(3);
  expect(translationBufferDepth(300_000)).toBe(1);
});
test("background work is sequential and is cancelled on scope exit", async () => {
  let finish!: () => void;
  request.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const { unmount } = renderHook(() => useLatchedTranslationBuffer({
    ownerId: "user", sessionId: "session", generation: 1, currentEntryId: "entry-1", currentOrdinal: 1,
    targetLanguageCode: "ru", members: [member(1), member(2), member(3), member(4)],
  }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  const input = request.mock.calls[0][0];
  expect(input).toMatchObject({ entryId: "entry-2", targetLanguageCode: "ru", background: true });
  unmount(); finish();
  await Promise.resolve();
  expect(input.signal.aborted).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
  expect(snapshot).not.toHaveBeenCalled();
});
test("ordinary sessions read canonical membership; superseded runs enqueue nothing", async () => {
  snapshot.mockResolvedValue({ sessionId: "session", runStatus: "superseded", members: [member(1), member(2)] });
  renderHook(() => useLatchedTranslationBuffer({ ownerId: "user", sessionId: "session", currentEntryId: "entry-1", targetLanguageCode: "ru" }));
  await waitFor(() => expect(snapshot).toHaveBeenCalledWith("user", "session"));
  expect(request).not.toHaveBeenCalled();
});

test("additional language stays one ahead while the primary buffer expands", async () => {
  recordTranslationPreparationDuration(300_000);
  renderHook(() => useLatchedTranslationBuffer({
    ownerId: "user", sessionId: "session", currentEntryId: "entry-1", currentOrdinal: 1,
    targetLanguageCode: "ru", additionalTargetLanguageCode: "en",
    members: [member(1), member(2), member(3), member(4), member(5)],
  }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
  expect(request.mock.calls.filter(([i]) => i.targetLanguageCode === "ru").map(([i]) => i.entryId)).toEqual(["entry-2", "entry-3", "entry-4"]);
  expect(request.mock.calls.filter(([i]) => i.targetLanguageCode === "en").map(([i]) => i.entryId)).toEqual(["entry-2"]);
});
test.each([null, "off"])("additional language is inactive with primary %s", async (primary) => {
  renderHook(() => useLatchedTranslationBuffer({
    ownerId: "user", sessionId: "session", currentEntryId: "entry-1", currentOrdinal: 1,
    targetLanguageCode: primary, additionalTargetLanguageCode: "en",
    members: [member(1), {...member(2), consumedAt: "done"}, {...member(3), unavailableAt: "gone"}, member(4), member(5)],
  }));
  await Promise.resolve();expect(request).not.toHaveBeenCalled();
});
test.each([null, "off", "ru"])("secondary %s adds no duplicate or disabled requests", async (secondary) => {
  renderHook(() => useLatchedTranslationBuffer({ownerId: "user", sessionId: "session", currentEntryId: "entry-1", currentOrdinal: 1, targetLanguageCode: "ru", additionalTargetLanguageCode: secondary, members: [member(1), member(2)]}));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  expect(request.mock.calls[0][0].targetLanguageCode).toBe("ru");
});
test("a pending primary does not delay additional preparation", async () => {
  request.mockImplementation(({targetLanguageCode}) => targetLanguageCode === "ru" ? new Promise(() => {}) : Promise.resolve("ready"));
  const view = renderHook(() => useLatchedTranslationBuffer({ownerId: "user", sessionId: "session", currentEntryId: "entry-1", currentOrdinal: 1, targetLanguageCode: "ru", additionalTargetLanguageCode: "en", members: [member(1), member(2)]}));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  const signals = request.mock.calls.map(([i]) => i.signal);
  view.unmount();expect(signals.every(signal => signal.aborted)).toBe(true);
});
test("disabling the primary cancels additional preparation", async () => {
  request.mockImplementation(() => new Promise(() => {}));
  const view = renderHook(({primary}) => useLatchedTranslationBuffer({ownerId:"user",sessionId:"session",currentEntryId:"entry-1",currentOrdinal:1,targetLanguageCode:primary,additionalTargetLanguageCode:"en",members:[member(1),member(2)]}), {initialProps:{primary:"ru" as string|null}});
  await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
  const signals=request.mock.calls.map(([i])=>i.signal);
  view.rerender({primary:null});expect(signals.every(s=>s.aborted)).toBe(true);expect(request).toHaveBeenCalledTimes(2);
});
test("additional-only stored settings do not read or prepare a session", async () => {
  snapshot.mockResolvedValue({sessionId: "session", runStatus: "active", members: [member(1), member(2), member(3)]});
  renderHook(() => useLatchedTranslationBuffer({ownerId: "user", sessionId: "session", currentEntryId: "entry-1", targetLanguageCode: null, additionalTargetLanguageCode: "en"}));
  await Promise.resolve();expect(request).not.toHaveBeenCalled();expect(snapshot).not.toHaveBeenCalled();
});
