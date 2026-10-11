import { buildDictionaryMeaningTranslationRequest } from "@/lib/translation/dictionaryMeaningTranslationContract";
import { dictionaryMeaningTranslatedPaths } from "@/lib/translation/dictionaryMeaningTranslationService";
import { sanitizeTranslationOverlay } from "@/lib/translation/translationArtifactSafety";
import { describe, expect, test } from "vitest";
import { buildDictionaryMeaningTranslationArtifact } from "@/lib/translation/dictionaryMeaningTranslationArtifact";

describe("dictionary meaning translation artifact", () => {
  test("stores generated alternatives separately from source content", () => {
    expect(
      buildDictionaryMeaningTranslationArtifact({
        entryTranslation: {
          primaryText: "бельё",
          alternativeTexts: ["одежда", "текстиль"],
          baseText: "товар",
          note: "Здесь имеется в виду одежда для стирки.",
        },
        contentTranslations: [
          { fieldId: "definition", text: "ткань; одежда" },
          {
            fieldId: "example:0",
            text: "Грязное бельё можно положить в стиральную машину.",
          },
          { fieldId: "usage-pattern", text: "схема употребления" },
          { fieldId: "usage-note", text: "разговорное" },
          { fieldId: "idiom:0", text: "полакомиться чем-либо" },
          {
            fieldId: "idiom:0:explanation",
            text: "с удовольствием съесть или выпить что-либо",
          },
          {
            fieldId: "idiom:0:example:0",
            text: "Кот полакомился сыром.",
          },
        ],
      }),
    ).toEqual({
      headword: "бельё",
      entryTranslation: {
        primaryText: "бельё",
        alternativeTexts: ["одежда", "текстиль"],
        baseText: "товар",
        note: "Здесь имеется в виду одежда для стирки.",
      },
      meanings: [
        {
          definition: "ткань; одежда",
          context: "схема употребления",
          note: "разговорное",
          examples: ["Грязное бельё можно положить в стиральную машину."],
          idioms: [
            {
              expression: "полакомиться чем-либо",
              explanation: "с удовольствием съесть или выпить что-либо",
              examples: ["Кот полакомился сыром."],
            },
          ],
        },
      ],
    });
  });

  test("marks an idiom-only entry artifact complete without inventing a headword", () => {
    expect(
      buildDictionaryMeaningTranslationArtifact({
        entryTranslation: null,
        contentTranslations: [
          { fieldId: "idiom:0", text: "полакомиться чем-либо" },
        ],
      }),
    ).toEqual({
      entryTranslation: null,
      meanings: [{ idioms: [{ expression: "полакомиться чем-либо" }] }],
    });
  });
});

test("maximum-sized request retains coverage metadata including the extra headword path", () => {
  const request = buildDictionaryMeaningTranslationRequest({
    entryId: "entry",
    sourceContentFingerprint: "revision",
    sourceLanguageCode: "nl",
    targetLanguageCode: "ru",
    word: {
      headword: "oog",
      raw: {
        meanings: [
          {
            definition: "een zintuig",
            examples: Array.from({ length: 127 }, (_, i) => `voorbeeld ${i}`),
          },
        ],
      },
    },
  });
  expect(request.content).toHaveLength(128);
  const translatedPaths = dictionaryMeaningTranslatedPaths(request);
  expect(translatedPaths).toHaveLength(129);
  expect(
    sanitizeTranslationOverlay({
      headword: "глаз",
      __meta: { translatedPaths },
    })?.__meta?.translatedPaths,
  ).toEqual(translatedPaths);
  expect(
    sanitizeTranslationOverlay({
      headword: "глаз",
      __meta: { translatedPaths: [...translatedPaths, ["excess"]] },
    })?.__meta?.translatedPaths,
  ).toBeUndefined();
});
