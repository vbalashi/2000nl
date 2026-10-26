import { publishDictionaryTranslationReady } from "@/lib/translation/dictionaryTranslationEvents";
import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { useWordContextPrompt } from "@/components/training/v2/useWordContextPrompt";
import { loadWordContextPrompt } from "@/lib/training/wordContextPrompt";
vi.mock("@/lib/training/wordContextPrompt", () => ({
  loadWordContextPrompt: vi.fn(),
}));
const input = {
  cacheOwnerId: "owner",
  trainingSessionId: "run",
  entryId: "entry",
  contentLanguageCode: "nl",
  translationTargetLanguageCode: "ru",
  wordInContext: true,
  retry: 0,
};
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

test("a temporary preparation failure recovers automatically without a click", async () => {
  vi.useFakeTimers();
  vi.mocked(loadWordContextPrompt)
    .mockRejectedValueOnce(new Error("temporary network failure"))
    .mockResolvedValueOnce({ state: "translation-unavailable" })
    .mockResolvedValue({
      state: "ready",
      prompt: {
        text: "перевод",
        sourceText: "voorbeeld",
        contentNodeId: "node",
        sourceTextFingerprint: "fingerprint",
      },
    });
  const view = renderHook(() => useWordContextPrompt(input));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(view.result.current?.state).toBe("ready");
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(3);
});

test("failed preparation retries are bounded and manual retry starts a fresh attempt", async () => {
  vi.useFakeTimers();
  vi.mocked(loadWordContextPrompt).mockResolvedValue({
    state: "translation-unavailable",
  });
  const view = renderHook(
    ({ retry }) => useWordContextPrompt({ ...input, retry }),
    { initialProps: { retry: 0 } },
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(3);
  view.rerender({ retry: 1 });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(6);
});

test("fast pending retries are bounded while periodic recovery remains available", async () => {
  vi.useFakeTimers();
  vi.mocked(loadWordContextPrompt).mockResolvedValue({
    state: "translation-pending",
  });
  const view = renderHook(() => useWordContextPrompt(input));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(360000);
  });
  const count = vi.mocked(loadWordContextPrompt).mock.calls.length;
  expect(count).toBeLessThan(160);
  expect(view.result.current).toEqual({ state: "translation-pending" });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(count + 1);
  expect(vi.mocked(loadWordContextPrompt).mock.lastCall?.[0].force).toBe(false);
});

test("leaving the card cancels pending translation rechecks", async () => {
  vi.useFakeTimers();
  vi.mocked(loadWordContextPrompt).mockResolvedValue({
    state: "translation-pending",
  });
  const view = renderHook(() => useWordContextPrompt(input));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  const signal = vi.mocked(loadWordContextPrompt).mock.calls[0][0].signal!;
  view.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(signal.aborted).toBe(true);
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(1);
});

test("a slow pending translation becomes ready for the same frozen member", async () => {
  vi.useFakeTimers();
  const started = Date.now();
  const prompt = {
    text: "перевод",
    sourceText: "voorbeeld",
    contentNodeId: "frozen-node",
    sourceTextFingerprint: "frozen-fingerprint",
  };
  vi.mocked(loadWordContextPrompt).mockImplementation(async () =>
    Date.now() - started < 100000
      ? { state: "translation-pending" }
      : { state: "ready", prompt },
  );
  const view = renderHook(() => useWordContextPrompt(input));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50000);
  });
  expect(view.result.current?.state).toBe("translation-pending");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(52000);
  });
  expect(view.result.current).toEqual({ state: "ready", prompt });
  for (const [request] of vi.mocked(loadWordContextPrompt).mock.calls) {
    expect(request).toMatchObject({
      userId: "owner",
      sessionId: "run",
      entryId: "entry",
      translationTargetLanguageCode: "ru",
    });
  }
  const count = vi.mocked(loadWordContextPrompt).mock.calls.length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(count + 1);
});

test("focus refreshes a ready context without forcing regeneration or clearing the frozen prompt", async () => {
  vi.mocked(loadWordContextPrompt)
    .mockResolvedValueOnce({
      state: "ready",
      prompt: {
        text: "старый",
        sourceText: "voorbeeld",
        contentNodeId: "node",
        sourceTextFingerprint: "fingerprint",
      },
    })
    .mockResolvedValue({
      state: "ready",
      prompt: {
        text: "новый",
        sourceText: "voorbeeld",
        contentNodeId: "node",
        sourceTextFingerprint: "fingerprint",
      },
    });
  const view = renderHook(() => useWordContextPrompt(input));
  await act(async () => {});
  expect(view.result.current?.state).toBe("ready");
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(view.result.current).toMatchObject({
    state: "ready",
    prompt: {
      text: "новый",
      contentNodeId: "node",
      sourceTextFingerprint: "fingerprint",
    },
  });
  expect(vi.mocked(loadWordContextPrompt).mock.lastCall?.[0].force).toBe(false);
});

test("a ready hint during prompt lookup is retained for one follow-up", async () => {
  const {publishDictionaryTranslationReady}=await import("@/lib/translation/dictionaryTranslationEvents");
  let finish!: (value: {state:"translation-pending"})=>void;
  vi.mocked(loadWordContextPrompt).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue({state:"source-unavailable"});
  const view=renderHook(()=>useWordContextPrompt(input));
  await act(async()=>{
    publishDictionaryTranslationReady({entryId:input.entryId,targetLanguageCode:"ru"});
    publishDictionaryTranslationReady({entryId:input.entryId,targetLanguageCode:"ru"});
  });
  expect(loadWordContextPrompt).toHaveBeenCalledOnce();
  await act(async()=>finish({state:"translation-pending"}));
  expect(loadWordContextPrompt).toHaveBeenCalledTimes(2);
  expect(view.result.current?.state).toBe("source-unavailable");
  view.unmount();
});

test("permit arrival preserves the ready prompt and is used only by later current-card refresh",async()=>{
 const ready={state:"ready" as const,prompt:{text:"перевод",sourceText:"voorbeeld",contentNodeId:"node",sourceTextFingerprint:"fingerprint"}};
 vi.mocked(loadWordContextPrompt).mockResolvedValue(ready);
 let permit:{sessionId:string;permitId:string}|undefined;
 const view=renderHook(()=>useWordContextPrompt({...input,getCurrentCard:()=>permit}));
 await act(async()=>{await Promise.resolve();});
 expect(view.result.current).toEqual(ready);expect(loadWordContextPrompt).toHaveBeenCalledOnce();
 permit={sessionId:"run",permitId:"75300000-0000-4000-8000-000000000001"};view.rerender();
 expect(view.result.current).toEqual(ready);expect(loadWordContextPrompt).toHaveBeenCalledOnce();
 await act(async()=>{publishDictionaryTranslationReady({entryId:"entry",targetLanguageCode:"ru"});await Promise.resolve();});
 expect(vi.mocked(loadWordContextPrompt).mock.lastCall?.[0].currentCard).toEqual(permit);
});
