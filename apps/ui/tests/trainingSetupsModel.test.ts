import { expect, test } from "vitest";
import { canonicalDraft, emptyTrainingSetups, parseTrainingSetupsDocument, parseTrainingSetupsSnapshot } from "@/lib/training/setups/model";
const draft = {
  scenarioId: "understanding", modes: ["definition-to-word" as const], cardFilter: "review" as const,
  listValue: "curated:nt2", sourceValue: "all", newReviewRatio: 2, dateWindow: "all" as const, sessionSize: 20,
};
const training = { id: "one", name: "Words", languageCode: "nl", draft };
const document = { schemaVersion: 1, trainings: [training], mainTrainingId: "one" };
test("account document preserves canonical IDs, language and a single main training", () => {
  expect(parseTrainingSetupsDocument(document)).toEqual(document);
  expect(parseTrainingSetupsDocument({ ...document, mainTrainingId: "unknown" })).toBeNull();
  expect(parseTrainingSetupsDocument({ ...document, trainings: [training, training] })).toBeNull();
  expect(parseTrainingSetupsSnapshot({ revision: 3, document })).toEqual({ revision: 3, document });
  expect(parseTrainingSetupsSnapshot({ revision: -1, document })).toBeNull();
  expect(parseTrainingSetupsSnapshot(emptyTrainingSetups())).toEqual(emptyTrainingSetups());
});
test.each([
  { modes: ["listen-type"] }, { modes: [] }, { modes: ["definition-to-word", "definition-to-word"] },
  { family: "word-in-context", modes: ["word-to-definition"] },
  { family: "sentence", scenarioId: "understanding" },
  { materialMode: "selected-dictionaries", dictionaryIds: [] },
  { dictionaryIds: ["bad"] }, { dateWindow: "daysAgo", daysAgo: undefined },
  { sessionSize: 0 }, { sessionSize: "all-due-today", family: "idiom", scenarioId: "idiom" },
  { partOfSpeech: ["noun"] }, { nounArticles: ["a"] }, { newReviewRatio: 0 },
])("rejects invalid exercise/source/filter contracts: %j", change => {
  expect(parseTrainingSetupsDocument({ ...document, trainings: [{ ...training, draft: { ...draft, ...change } }] })).toBeNull();
});
test("accepts all canonical families and rejects unbounded/account-shaped data", () => {
  for (const [family, scenarioId] of [["meaning", "understanding"], ["idiom", "idiom"], ["sentence", "sentences"], ["word-in-context", "understanding"]]) {
    expect(parseTrainingSetupsDocument({ ...document, trainings: [{ ...training, draft: { ...draft, family, scenarioId } }] })).not.toBeNull();
  }
  expect(parseTrainingSetupsDocument({ ...document, trainings: Array.from({ length: 101 }, (_, i) => ({ ...training, id: `${i}` })) })).toBeNull();
  expect(parseTrainingSetupsDocument({ ...document, trainings: [{ ...training, languageCode: "../../nl" }] })).toBeNull();
  expect(parseTrainingSetupsDocument({ ...document, trainings: [{ ...training, name: " " }] })).toBeNull();
  expect(canonicalDraft({ ...draft, userId: "other", schedulingState: "fake" } as typeof draft)).toEqual(draft);
  expect(parseTrainingSetupsDocument({ ...document, userId: "other" })).toEqual(document);
});
