import type { IdiomExerciseContent } from "@/lib/training/idiomExerciseContent";
import { gateFurnitureEntry, gateSingleSenseGroup } from "./senseCardV1GateFixture";

/** Synthetic de koe scenario: idiom-only entry and a separately translated main sense. */
export const cowIdiomGateContent: IdiomExerciseContent = (() => {
  const partOfSpeech = { termId: "part-of-speech.zn", messageKey: "partOfSpeech.zn", sourceValue: "zn" };
  const expression = { contentNodeId: "cow-idiom", parentContentNodeId: null, kind: "idiom" as const,
    text: "over koetjes en kalfjes praten", order: 0, sourceTextFingerprint: "cow-idiom-v1", translations: [
      { translationId: "cow-expression-ru", targetLanguageCode: "ru", status: "ready" as const,
        text: "говорить о пустяках", literalText: "говорить о коровках и телятах", sourceTextFingerprint: "cow-idiom-v1", translationPolicyVersion: "gate-v1" },
    ] };
  const explanation = { contentNodeId: "cow-explanation", parentContentNodeId: expression.contentNodeId,
    kind: "idiom-explanation" as const, text: "gezellig praten over dingen die niet belangrijk zijn",
    order: 1, sourceTextFingerprint: "cow-explanation-v1", translations: [] };
  const entry = { ...gateFurnitureEntry, entryId: "cow-expression-entry", contentRevision: "cow-expression-entry-v1",
    partOfSpeech, meaningOrdinal: 2, translation: null, contentNodes: [expression, explanation] };
  const main = { ...gateFurnitureEntry, entryId: "cow-main-entry", contentRevision: "cow-main-v1",
    partOfSpeech, meaningOrdinal: 1, contentNodes: [{ ...expression, contentNodeId: "cow-definition",
      kind: "definition" as const, text: "een dier dat melk geeft", translations: [] }],
    translation: { translationId: "cow-main-ru", entryId: "cow-main-entry", targetLanguageCode: "ru",
      status: "ready" as const, text: "корова", baseText: "корова", alternativeTexts: [], note: null,
      sourceContentFingerprint: "cow-main-v1", translationPolicyVersion: "gate-v1", isFresh: true } };
  const group = { ...gateSingleSenseGroup, header: { ...gateSingleSenseGroup.header, text: "koe", article: "de", partOfSpeech }, entries: [entry, main] };
  return { group, headword: "koe", article: "de", partOfSpeech, entry, expression, explanation, examples: [] };
})();
