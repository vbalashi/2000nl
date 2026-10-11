import { describe, expect, test } from "vitest";
import { buildDictionaryMeaningTranslationRequest } from "@/lib/translation/dictionaryMeaningTranslationContract";
import { dictionaryMeaningTranslationCoverage as coverage } from "@/lib/translation/dictionaryMeaningTranslationReadiness";
const request = buildDictionaryMeaningTranslationRequest({
  entryId: "entry",
  sourceContentFingerprint: "source",
  sourceLanguageCode: "nl",
  targetLanguageCode: "ru",
  word: {
    headword: "oog",
    raw: {
      meanings: [
        {
          definition: "een zintuig",
          examples: ["blauwe ogen"],
          synonyms: ["kijker"],
          idioms: [
            {
              expression: "in het oog",
              explanation: "zichtbaar",
              examples: ["het valt in het oog"],
            },
          ],
        },
      ],
    },
  },
});
const full = {
  headword: "глаз",
  meanings: [
    {
      definition: "орган чувств",
      examples: ["голубые глаза"],
      synonyms: ["глазок"],
      idioms: [
        {
          expression: "на виду",
          explanation: "видно",
          examples: ["бросается в глаза"],
        },
      ],
    },
  ],
};
describe("dictionary translation readiness", () => {
  test("headword and claimed paths do not prove frozen example readiness", () => {
    const result = coverage(
      request,
      {
        headword: "глаз",
        __meta: { translatedPaths: [["meanings", 0, "examples", 0]] },
      },
      ["example:0"],
    );
    expect(result.cardReady).toBe(false);
    expect(result.requestComplete).toBe(false);
    expect(result.missingRequiredFieldIds).toEqual(["example:0"]);
  });
  test("selected-card readiness is separate from whole-request completeness", () => {
    const result = coverage(
      request,
      { headword: "глаз", meanings: [{ examples: ["голубые глаза"] }] },
      ["example:0"],
    );
    expect(result.cardReady).toBe(true);
    expect(result.requestComplete).toBe(false);
    expect(result.missingFieldIds).toContain("idiom:0:explanation");
  });
  test("every role requires actual values including idiom examples and relations", () => {
    expect(coverage(request, full)).toMatchObject({
      cardReady: true,
      requestComplete: true,
      missingFieldIds: [],
      translatedFields: 6,
    });
    const incomplete = structuredClone(full);
    incomplete.meanings[0].idioms[0].examples[0] = "  ";
    expect(coverage(request, incomplete).missingFieldIds).toEqual([
      "idiom:0:example:0",
    ]);
  });
  test("a source field omitted from the request cannot be marked ready", () => {
    expect(coverage(request, full, ["example:999"]).cardReady).toBe(false);
  });
  test("idiom-only entries require content without invented headword translation", () => {
    const idiomRequest = {
      ...request,
      content: request.content.filter((item) =>
        item.fieldId.startsWith("idiom:"),
      ),
    };
    expect(coverage(idiomRequest, { meanings: full.meanings })).toMatchObject({
      entryReady: true,
      requestComplete: true,
    });
  });
});
