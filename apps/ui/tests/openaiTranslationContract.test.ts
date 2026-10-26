import { describe, expect, test } from "vitest";
import {
  buildOpenAITranslationMessages,
  parseOpenAITranslationResult,
} from "@/lib/translation/openaiTranslationContract";

describe("OpenAI translation model contract", () => {
  test("builds the production request with all contextual fields", () => {
    const messages = buildOpenAITranslationMessages(
      ["enorm toe."],
      "ru",
      {
        sourceLanguageCode: "nl",
        purpose: "youtube-span-translation",
        partOfSpeech: "bijwoord",
        partOfSpeechCode: "bw",
        contextText:
          "Plotseling nemen de kansen om leven in het universum te vinden enorm toe.",
      },
    );

    expect(messages[0]).toMatchObject({ role: "system" });
    const payload = JSON.parse(messages[1].content);
    expect(payload).toMatchObject({
      targetLanguage: "Russian",
      targetLanguageCode: "ru",
      commentLanguage: "Russian",
      sourceLanguageCode: "nl",
      purpose: "youtube-span-translation",
      partOfSpeech: "bijwoord",
      partOfSpeechCode: "bw",
      texts: ["enorm toe."],
      contextText:
        "Plotseling nemen de kansen om leven in het universum te vinden enorm toe.",
      responseFormat: {
        translations: ["string"],
        literalTranslations: ["string"],
        note: "string | null",
      },
    });
  });

  test("parses the production response including aligned literal translations", () => {
    expect(
      parseOpenAITranslationResult(
        JSON.stringify({
          translations: ["резко возрастают."],
          literalTranslations: ["огромный палец ноги."],
          note: "Здесь это часть разделяемого глагола.",
        }),
        1,
      ),
    ).toEqual({
      translations: ["резко возрастают."],
      literalTranslations: ["огромный палец ноги."],
      note: "Здесь это часть разделяемого глагола.",
    });
  });
});
