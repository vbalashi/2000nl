import { describe, expect, test } from "vitest";
import {
  buildDictionaryMeaningTranslationMessages,
  buildDictionaryMeaningTranslationRequest,
  parseDictionaryMeaningTranslationResult,
  type DictionaryMeaningTranslationRequestV1,
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
