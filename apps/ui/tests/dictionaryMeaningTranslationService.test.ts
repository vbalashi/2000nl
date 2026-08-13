import { describe, expect, test, vi } from "vitest";
import {
  dictionaryMeaningTranslatedPaths,
  translateDictionaryMeaning,
} from "@/lib/translation/dictionaryMeaningTranslationService";
import type { DictionaryMeaningTranslationRequestV1 } from "@/lib/translation/dictionaryMeaningTranslationContract";

const request: DictionaryMeaningTranslationRequestV1 = {
  contractVersion: "dictionary-meaning-translation-v1",
  entryId: "entry-goed-cloth",
  sourceContentFingerprint: "source-revision-1",
  sourceLanguageCode: "nl",
  targetLanguageCode: "ru",
  headword: {
    text: "goed",
    article: "het",
    partOfSpeech: "zelfstandig naamwoord",
    partOfSpeechCode: "zn",
  },
  content: [
    { fieldId: "definition", role: "definition", text: "de stof" },
    {
      fieldId: "idiom:0:explanation",
      role: "idiom-explanation",
      text: "iets is bestemd voor iemand",
    },
  ],
};

describe("dictionary meaning translation service", () => {
  test("adapts a generic provider to the shared structured artifact", async () => {
    const translator = {
      translate: vi.fn(async () => ["бельё", "ткань", "предназначено кому-то"]),
    };

    await expect(
      translateDictionaryMeaning(translator as any, request),
    ).resolves.toEqual({
      entryTranslation: {
        primaryText: "бельё",
        alternativeTexts: [],
        baseText: "бельё",
        note: null,
      },
      contentTranslations: [
        { fieldId: "definition", text: "ткань" },
        {
          fieldId: "idiom:0:explanation",
          text: "предназначено кому-то",
        },
      ],
      meta: {},
    });
    expect(translator.translate).toHaveBeenCalledWith(
      ["het goed", "de stof", "iets is bestemd voor iemand"],
      "ru",
    );
  });

  test("preserves stable overlay paths for diagnostics", () => {
    expect(dictionaryMeaningTranslatedPaths(request)).toEqual([
      ["headword"],
      ["meanings", 0, "definition"],
      ["meanings", 0, "idioms", 0, "explanation"],
    ]);
  });
});
