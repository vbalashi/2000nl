import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useWordContextPrompt } from "@/components/training/v2/useWordContextPrompt";
import { loadWordContextPrompt } from "@/lib/training/wordContextPrompt";
vi.mock("@/lib/training/wordContextPrompt", () => ({loadWordContextPrompt: vi.fn()}));
const input = {cacheOwnerId:"owner",trainingSessionId:"run",entryId:"entry",contentLanguageCode:"nl",translationTargetLanguageCode:"ru",wordInContext:true,retry:0};
afterEach(() => {vi.useRealTimers();vi.clearAllMocks();});

test("a temporary preparation failure recovers automatically without a click", async () => {
  vi.useFakeTimers();
  vi.mocked(loadWordContextPrompt)
    .mockRejectedValueOnce(new Error("temporary network failure"))
    .mockResolvedValueOnce({state:"translation-unavailable"})
    .mockResolvedValue({state:"ready",prompt:{text:"перевод",sourceText:"voorbeeld",contentNodeId:"node",sourceTextFingerprint:"fingerprint"}});
  const view=renderHook(() => useWordContextPrompt(input));
  await act(async () => {await vi.advanceTimersByTimeAsync(10000);});
  expect(view.result.current?.state).toBe("ready");
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(3);
});

test("failed preparation retries are bounded and manual retry starts a fresh attempt", async () => {
  vi.useFakeTimers();
  vi.mocked(loadWordContextPrompt).mockResolvedValue({state:"translation-unavailable"});
  const view=renderHook(({retry}) => useWordContextPrompt({...input,retry}),{initialProps:{retry:0}});
  await act(async () => {await vi.advanceTimersByTimeAsync(60000);});
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(3);
  view.rerender({retry:1});
  await act(async () => {await vi.advanceTimersByTimeAsync(60000);});
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(6);
});

test("pending context retries are bounded and leave manual recovery available", async () => {
  vi.useFakeTimers();
  vi.mocked(loadWordContextPrompt).mockResolvedValue({state:"translation-pending"});
  const view=renderHook(() => useWordContextPrompt(input));
  await act(async () => {await vi.advanceTimersByTimeAsync(60000);});
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(11);
  expect(view.result.current).toEqual({state:"translation-pending"});
  await act(async () => {await vi.advanceTimersByTimeAsync(60000);});
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(11);
});

test("leaving the card cancels pending translation rechecks", async () => {
  vi.useFakeTimers();
  vi.mocked(loadWordContextPrompt).mockResolvedValue({state:"translation-pending"});
  const view=renderHook(() => useWordContextPrompt(input));
  await act(async () => {await vi.advanceTimersByTimeAsync(0);});
  const signal=vi.mocked(loadWordContextPrompt).mock.calls[0][0].signal!;
  view.unmount();
  await act(async () => {await vi.advanceTimersByTimeAsync(60000);});
  expect(signal.aborted).toBe(true);
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(1);
});
