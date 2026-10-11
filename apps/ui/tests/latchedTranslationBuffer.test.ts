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
