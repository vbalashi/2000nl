import { beforeEach, expect, test, vi } from "vitest";
const { translate } = vi.hoisted(() => ({ translate: vi.fn() }));
vi.mock("@/lib/translation/dictionaryMeaningTranslationCoordinator", () => ({
  coordinateDictionaryMeaningTranslation: translate,
}));
import { requestCurrentTrainingCardTranslation } from "@/lib/translation/currentTrainingCardTranslation";
const input = {
  wordEntryId: "entry",
  word: { id: "entry", headword: "Private", raw: { definition: "Protected" } },
  targetLang: "en",
  dbLang: "en",
};
beforeEach(() => {
  translate
    .mockReset()
    .mockResolvedValue({
      payload: { status: "ready", overlay: { private: "Protected" } },
      httpStatus: 200,
      cacheStatus: "miss",
    });
});
test("expired or wrong-run permit cannot trigger provider work", async () => {
  const result = await requestCurrentTrainingCardTranslation(
    input,
    async () => false,
  );
  expect(result.httpStatus).toBe(403);
  expect(translate).not.toHaveBeenCalled();
});
test("takeover/expiry during provider work withholds content", async () => {
  const authorize = vi
    .fn()
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);
  const result = await requestCurrentTrainingCardTranslation(input, authorize);
  expect(result.httpStatus).toBe(403);
  expect(JSON.stringify(result)).not.toContain("Protected");
  expect(translate).toHaveBeenCalledOnce();
});
test("valid currenttarget uses existing inline translator and rechecks authorization", async () => {
  const authorize = vi.fn().mockResolvedValue(true);
  expect(
    (await requestCurrentTrainingCardTranslation(input, authorize)).httpStatus,
  ).toBe(200);
  expect(authorize).toHaveBeenCalledTimes(2);
});
test("observing an archived target does not enqueue or start translation", async () => {
  const result = await requestCurrentTrainingCardTranslation(
    { ...input, observeOnly: true },
    async () => true,
  );
  expect(result.httpStatus).toBe(202);
  expect(translate).not.toHaveBeenCalled();
});
