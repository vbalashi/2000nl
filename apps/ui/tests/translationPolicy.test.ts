import { describe, expect, test } from "vitest";
import {
  buildDictionaryMeaningTranslationRequest,
} from "@/lib/translation/dictionaryMeaningTranslationContract";
import {
  IDIOM_ONLY_TRANSLATION_PIPELINE_VERSION,
  TRANSLATION_PIPELINE_VERSION,
  translationPipelineVersion,
  translationPolicyVersion,
} from "@/lib/translation/translationPolicy";

function requestFor(rawMeaning: Record<string, unknown>) {
  return buildDictionaryMeaningTranslationRequest({
    entryId: "entry-1",
    sourceContentFingerprint: "source-revision",
    sourceLanguageCode: "nl",
    targetLanguageCode: "ru",
    word: {
      headword: "goed",
      part_of_speech: "zn",
      raw: { meanings: [rawMeaning] },
    },
  });
}

describe("dictionary meaning translation policy", () => {
  test("revises only idiom-only artifacts", () => {
    const ordinary = requestFor({ definition: "de dingen; de voorwerpen" });
    const idiomOnly = requestFor({
      definition: "",
      idioms: [
        {
          expression: "zich te goed doen aan iets",
          explanation: "iets lekker opeten of opdrinken",
        },
      ],
    });

    expect(translationPipelineVersion(ordinary)).toBe(
      TRANSLATION_PIPELINE_VERSION,
    );
    expect(translationPolicyVersion("openai", ordinary)).toBe(
      translationPolicyVersion("openai"),
    );
    expect(translationPipelineVersion(idiomOnly)).toBe(
      IDIOM_ONLY_TRANSLATION_PIPELINE_VERSION,
    );
    expect(translationPolicyVersion("openai", idiomOnly)).not.toBe(
      translationPolicyVersion("openai", ordinary),
    );
  });
});
