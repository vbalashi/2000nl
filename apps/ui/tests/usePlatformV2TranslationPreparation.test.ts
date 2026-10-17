import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { usePlatformV2TranslationPreparation } from "@/lib/platform/usePlatformV2TranslationPreparation";
import { publishDictionaryTranslationReady } from "@/lib/translation/dictionaryTranslationEvents";
import { singleSenseEntry } from "./platformV2TrainingFixture";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform/platformV2TrainingMediaClient", () => ({
  requestPlatformV2Translation: request,
}));
beforeEach(() => { request.mockReset(); vi.stubGlobal("BroadcastChannel", undefined); });
afterEach(() => { vi.unstubAllGlobals(); });
const incomplete = {
  ...singleSenseEntry,
  capabilities: [
    ...singleSenseEntry.capabilities,
    {
      actionId: "request-translation" as const,
      elementId: "translate",
      messageKey: "senseCard.translation.request",
      target: {
        kind: "entry" as const,
        entryId: singleSenseEntry.entryId,
        contentRevision: singleSenseEntry.contentRevision,
      },
      targetLanguageCode: "en",
    },
  ],
};

test("prepares a repair-capable card even though its headword and example are translated", async () => {
  let finish!: (status: "ready") => void;
  request.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const refresh = vi.fn().mockResolvedValue(undefined);
  const view = renderHook(() =>
    usePlatformV2TranslationPreparation({
      entry: incomplete,
      targetLanguageCode: "en",
      enabled: true,
      refresh,
    }),
  );
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  act(() =>
    publishDictionaryTranslationReady({
      entryId: incomplete.entryId,
      targetLanguageCode: "en",
    }),
  );
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => finish("ready"));
  expect(refresh).toHaveBeenCalledOnce();
  expect(view.result.current.current).toBe(false);
  view.unmount();
});

test("revalidates a visible translated card after another surface completes the same translation", async () => {
  const refresh = vi.fn().mockResolvedValue(undefined);
  const view = renderHook(() =>
    usePlatformV2TranslationPreparation({
      entry: singleSenseEntry,
      targetLanguageCode: "en",
      enabled: true,
      refresh,
    }),
  );
  await act(async () =>
    publishDictionaryTranslationReady({
      entryId: singleSenseEntry.entryId,
      targetLanguageCode: "ru",
    }),
  );
  expect(refresh).not.toHaveBeenCalled();
  await act(async () =>
    publishDictionaryTranslationReady({
      entryId: singleSenseEntry.entryId,
      targetLanguageCode: "en",
    }),
  );
  expect(refresh).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
  view.unmount();
});

test("navigation cancels observation and ignores late completion without refreshing the new card", async () => {
  let finish!: (status: "ready") => void;
  request.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const refresh = vi.fn().mockResolvedValue(undefined);
  const view = renderHook(
    ({ entry }) =>
      usePlatformV2TranslationPreparation({
        entry,
        targetLanguageCode: "en",
        enabled: true,
        refresh,
      }),
    { initialProps: { entry: incomplete as typeof singleSenseEntry } },
  );
  const signal = request.mock.calls[0][1].signal as AbortSignal;
  view.rerender({ entry: { ...singleSenseEntry, entryId: "next-card" } });
  expect(signal.aborted).toBe(true);
  await act(async () => finish("ready"));
  expect(refresh).not.toHaveBeenCalled();
  view.unmount();
});

test("focus does not duplicate the scheduled pending observation", async () => {
  request.mockResolvedValueOnce("pending").mockResolvedValueOnce("ready");
  const refresh = vi
    .fn()
    .mockResolvedValueOnce(incomplete)
    .mockResolvedValue(singleSenseEntry);
  const view = renderHook(() =>
    usePlatformV2TranslationPreparation({
      entry: incomplete,
      targetLanguageCode: "en",
      enabled: true,
      refresh,
    }),
  );
  await waitFor(() => expect(view.result.current.current).toBe(false));
  expect(request).toHaveBeenCalledOnce();
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls.every(([, options]) => !options.force)).toBe(true);
  view.unmount();
});

test("a policy rollout while repair stays true recovers a failed request on focus without force", async () => {
  request
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce("ready");
  const newer = {
    ...incomplete,
    translation: {
      ...incomplete.translation!,
      translationPolicyVersion: "new-policy",
    },
  };
  const refresh = vi
      .fn()
      .mockResolvedValueOnce(newer)
      .mockResolvedValue(singleSenseEntry),
    status = vi.fn();
  const view = renderHook(() =>
    usePlatformV2TranslationPreparation({
      entry: incomplete,
      targetLanguageCode: "en",
      enabled: true,
      refresh,
      onStatus: status,
    }),
  );
  await waitFor(() => expect(status).toHaveBeenCalledWith("failed"));
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(request.mock.calls[1][1].force).not.toBe(true);
  view.unmount();
});

test("keeps observing after a pending window, even beyond a minute", async () => {
  let poll: (() => void) | undefined;
  const original=setTimeout;
  const timeout=vi.spyOn(globalThis,"setTimeout").mockImplementation(((callback: () => void, ms: number, ...args: unknown[]) => {
    if(ms===3000){poll=callback;return 777;}
    return original(callback,ms,...args);
  }) as typeof setTimeout);
  const now=vi.spyOn(Date,"now");
  request.mockResolvedValueOnce("pending").mockReturnValue(new Promise(() => {}));
  const onStatus=vi.fn();
  const view=renderHook(()=>usePlatformV2TranslationPreparation({entry:incomplete,targetLanguageCode:"en",enabled:true,refresh:vi.fn(),onStatus}));
  try {
    await act(async()=>{});
    expect(poll).toBeTypeOf("function");
    now.mockReturnValue(Date.now()+65_000);
    await act(async()=>poll?.());
    expect(request).toHaveBeenCalledTimes(2);
    expect(view.result.current.current).toBe(true);
    expect(view.result.current.status).toBe("pending");
    expect(onStatus).not.toHaveBeenCalledWith("failed");
  } finally {view.unmount();timeout.mockRestore();now.mockRestore();}
});

test("confirmed failure exposes retry; one explicit retry forces only the failed job", async () => {
  request.mockResolvedValueOnce("failed").mockResolvedValueOnce("ready");
  const refresh=vi.fn().mockResolvedValue(singleSenseEntry);
  const view=renderHook(()=>usePlatformV2TranslationPreparation({entry:incomplete,targetLanguageCode:"en",enabled:true,refresh}));
  await waitFor(()=>expect(view.result.current.status).toBe("failed"));
  await act(async()=>view.result.current.retry());
  await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());
  expect(request.mock.calls[0][1].force).not.toBe(true);
  expect(request.mock.calls[1][1].force).toBe(true);
  expect(view.result.current.status).toBeNull();
  view.unmount();
});


test("ready hints during an authoritative read coalesce into one follow-up", async () => {
 let finish!: (entry: typeof singleSenseEntry) => void;
 const refresh=vi.fn().mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue(singleSenseEntry);
 const view=renderHook(()=>usePlatformV2TranslationPreparation({entry:singleSenseEntry,targetLanguageCode:"en",enabled:true,refresh}));
 await act(async()=>publishDictionaryTranslationReady({entryId:singleSenseEntry.entryId,targetLanguageCode:"en"}));
 expect(refresh).toHaveBeenCalledOnce();
 await act(async()=>{
  publishDictionaryTranslationReady({entryId:singleSenseEntry.entryId,targetLanguageCode:"en"});
  publishDictionaryTranslationReady({entryId:singleSenseEntry.entryId,targetLanguageCode:"en"});
 });
 await act(async()=>finish(singleSenseEntry));
 expect(refresh).toHaveBeenCalledTimes(2);
 view.unmount();
});
