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
      meanings: [
        { idioms: [{ expression: "полакомиться чем-либо" }] },
      ],
    });
  });
});
