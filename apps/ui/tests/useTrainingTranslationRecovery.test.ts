import { act, renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";
const { observe } = vi.hoisted(() => ({ observe: vi.fn() }));
vi.mock("@/lib/translation/dictionaryTranslationObservation", () => ({ observeDictionaryMeaningTranslation: observe }));
import { useTrainingTranslation } from "@/lib/training/useTrainingTranslation";

test("changing a legacy card aborts observation and ignores its late result", async () => {
  let finishOld!: (response: Response) => void;
  observe.mockReset().mockImplementationOnce(() => new Promise<Response>(resolve => { finishOld = resolve; }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ status: "ready", overlay: { headword: "current" } })));
  const { result, rerender, unmount } = renderHook(({ wordId }) => useTrainingTranslation({ wordId, translationLang: "ru", revealed: false, translationTooltipOpen: false }), { initialProps: { wordId: "old" } });
  let old!: Promise<void>;
  act(() => { old = result.current.fetchTranslation(); });
  const signal = observe.mock.calls[0][0].signal;
  rerender({ wordId: "new" });
  expect(signal.aborted).toBe(true);
  await act(async () => { await result.current.fetchTranslation(); });
  await act(async () => { finishOld(new Response(JSON.stringify({ status: "ready", overlay: { headword: "obsolete" } }))); await old; });
  expect(result.current.getHeadwordTranslated()).toBe("current");
  unmount();
});
