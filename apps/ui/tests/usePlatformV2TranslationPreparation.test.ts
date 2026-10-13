import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { usePlatformV2TranslationPreparation } from "@/lib/platform/usePlatformV2TranslationPreparation";
import { publishDictionaryTranslationReady } from "@/lib/translation/dictionaryTranslationEvents";
import { singleSenseEntry } from "./platformV2TrainingFixture";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platform/platformV2TrainingMediaClient", () => ({
  requestPlatformV2Translation: request,
}));
beforeEach(() => request.mockReset());
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

test("focus resumes deduplicated preparation after a settled request even when repair stays true", async () => {
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
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
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
