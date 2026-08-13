import { describe, expect, test } from "vitest";
import {
  buildDictionaryMeaningTranslationMessages,
  buildDictionaryMeaningTranslationRequest,
  DICTIONARY_MEANING_TRANSLATION_LIMITS,
  parseDictionaryMeaningTranslationResult,
  type DictionaryMeaningTranslationRequestV1,
  tokenUpperBound,
} from "@/lib/translation/dictionaryMeaningTranslationContract";

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
    {
      fieldId: "definition",
      role: "definition",
      text: "de stof; de kleren",
    },
    {
      fieldId: "example:0",
      role: "example",
      text: "het vuile goed kun je in de machine doen",
    },
  ],
};

describe("dictionary meaning translation contract", () => {
  test("builds a bounded exact-meaning request from a dictionary entry", () => {
    expect(
      buildDictionaryMeaningTranslationRequest({
        entryId: "entry-goed-cloth",
        sourceContentFingerprint: "source-revision-1",
        sourceLanguageCode: "nl",
        targetLanguageCode: "ru",
        word: {
          headword: "goed",
          gender: "het",
          part_of_speech: "zn",
          raw: {
            meanings: [
              {
                definition: "de stof; de kleren",
                context: "",
                examples: ["het vuile goed kun je in de machine doen"],
                idioms: [],
              },
            ],
          },
        },
      }),
    ).toEqual(request);
  });

  test("identifies one exact meaning and requests structured alternatives", () => {
    const messages = buildDictionaryMeaningTranslationMessages(request);
    const payload = JSON.parse(messages[1].content);

    expect(payload).toMatchObject({
      contractVersion: "dictionary-meaning-translation-v1",
      entryId: "entry-goed-cloth",
      sourceContentFingerprint: "source-revision-1",
      sourceLanguageCode: "nl",
      targetLanguageCode: "ru",
      headword: request.headword,
      content: request.content,
      responseFormat: {
        entryTranslation: {
          primaryText: "string",
          alternativeTexts: ["string"],
          baseText: "string | null",
          note: "string | null",
        },
        contentTranslations: [
          {
            fieldId: "string",
            text: "string",
          },
        ],
      },
    });
  });

  test("bounds oversized context deterministically without splitting Unicode", () => {
    const oversized = buildDictionaryMeaningTranslationRequest({
      entryId: "entry-large",
      sourceContentFingerprint: "source-large",
      sourceLanguageCode: "nl",
      targetLanguageCode: "ru",
      word: {
        headword: "🧀".repeat(200),
        part_of_speech: "zn",
        raw: {
          meanings: [
            {
              definition: "😀".repeat(1_000),
              examples: Array.from({ length: 50 }, (_, index) =>
                `${index}:${"x".repeat(1_000)}`,
              ),
              idioms: [],
              note: "n".repeat(1_000),
            },
          ],
        },
      },
    });

    expect(Array.from(oversized.headword.text)).toHaveLength(
      DICTIONARY_MEANING_TRANSLATION_LIMITS.headwordCharacters,
    );
    expect(oversized.content.length).toBeGreaterThan(0);
    expect(oversized.content.length).toBeLessThanOrEqual(
      DICTIONARY_MEANING_TRANSLATION_LIMITS.contentItems,
    );
    expect(
      oversized.content.reduce(
        (sum, item) => sum + Array.from(item.text).length,
        0,
      ),
    ).toBeLessThanOrEqual(
      DICTIONARY_MEANING_TRANSLATION_LIMITS.contentCharacters,
    );
    expect(
      Math.max(...oversized.content.map((item) => Array.from(item.text).length)),
    ).toBeLessThanOrEqual(
      DICTIONARY_MEANING_TRANSLATION_LIMITS.contentItemCharacters,
    );
    expect(oversized.headword.text.endsWith("🧀")).toBe(true);
    expect(
      oversized.content.reduce(
        (sum, item) => sum + tokenUpperBound(item.text),
        0,
      ),
    ).toBeLessThanOrEqual(
      DICTIONARY_MEANING_TRANSLATION_LIMITS.contentTokenUpperBound,
    );
  });

  test("strictly parses aligned entry and content translations", () => {
    expect(
      parseDictionaryMeaningTranslationResult(
        JSON.stringify({
          entryTranslation: {
            primaryText: "бельё",
            alternativeTexts: ["одежда", "текстиль"],
            baseText: "добро",
            note: "Здесь имеется в виду одежда для стирки.",
          },
          contentTranslations: [
            { fieldId: "definition", text: "ткань; одежда" },
            {
              fieldId: "example:0",
              text: "Грязное бельё можно положить в стиральную машину.",
            },
          ],
        }),
        request,
      ),
    ).toEqual({
      entryTranslation: {
        primaryText: "бельё",
        alternativeTexts: ["одежда", "текстиль"],
        baseText: "добро",
        note: "Здесь имеется в виду одежда для стирки.",
      },
      contentTranslations: [
        { fieldId: "definition", text: "ткань; одежда" },
        {
          fieldId: "example:0",
          text: "Грязное бельё можно положить в стиральную машину.",
        },
      ],
    });
  });

  test("rejects omitted alternatives and misaligned content", () => {
    expect(() =>
      parseDictionaryMeaningTranslationResult(
        JSON.stringify({
          entryTranslation: {
            primaryText: "бельё",
            baseText: null,
            note: null,
          },
          contentTranslations: [],
        }),
        request,
      ),
    ).toThrow("alternativeTexts");
  });

  test("rejects provider output that exceeds response limits", () => {
    expect(() =>
      parseDictionaryMeaningTranslationResult(
        JSON.stringify({
          entryTranslation: {
            primaryText: "бельё",
            alternativeTexts: Array.from(
              {
                length:
                  DICTIONARY_MEANING_TRANSLATION_LIMITS.alternativeTexts + 1,
              },
              (_, index) => `вариант ${index}`,
            ),
            baseText: null,
            note: null,
          },
          contentTranslations: request.content.map((item) => ({
            fieldId: item.fieldId,
            text: "перевод",
          })),
        }),
        request,
      ),
    ).toThrow("alternativeTexts exceeds");

    expect(() =>
      parseDictionaryMeaningTranslationResult(
        JSON.stringify({
          entryTranslation: {
            primaryText: "бельё",
            alternativeTexts: [],
            baseText: null,
            note: null,
          },
          contentTranslations: request.content.map((item, index) => ({
            fieldId: item.fieldId,
            text:
              index === 0
                ? "x".repeat(
                    DICTIONARY_MEANING_TRANSLATION_LIMITS.contentTranslationCharacters +
                      1,
                  )
                : "перевод",
          })),
        }),
        request,
      ),
    ).toThrow("contentTranslations[0].text exceeds");
  });

  test("allows no entry translation for an idiom-only meaning", () => {
    const idiomRequest: DictionaryMeaningTranslationRequestV1 = {
      ...request,
      content: [
        {
          fieldId: "idiom:0",
          role: "idiom",
          text: "zich te goed doen aan iets",
        },
      ],
    };

    expect(
      parseDictionaryMeaningTranslationResult(
        JSON.stringify({
          entryTranslation: null,
          contentTranslations: [
            { fieldId: "idiom:0", text: "полакомиться чем-либо" },
          ],
        }),
        idiomRequest,
      ),
    ).toEqual({
      entryTranslation: null,
      contentTranslations: [
        { fieldId: "idiom:0", text: "полакомиться чем-либо" },
      ],
    });
  });
});
