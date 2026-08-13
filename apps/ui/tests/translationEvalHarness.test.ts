import { describe, expect, test } from "vitest";
import {
  prepareTranslationEvalCase,
  prepareDictionaryMeaningEvalCase,
  prepareTranslationEvalRun,
} from "@/scripts/translationEvalHarness";
import { translationEvalCases } from "@/scripts/translationEvalCases";

describe("translation evaluation harness", () => {
  test("uses the production message contract for each goed meaning", () => {
    const prepared = translationEvalCases
      .filter((item) => item.id.startsWith("goed_zn_"))
      .map(prepareTranslationEvalCase);

    expect(prepared.map((item) => item.texts[0])).toEqual([
      "het goed",
      "het goed",
      "het goed",
    ]);
    expect(prepared.map((item) => item.texts[1])).toEqual([
      "de dingen; de voorwerpen",
      "dat wat goed is",
      "de stof; de kleren",
    ]);
    expect(prepared.map((item) => item.context)).toEqual([
      { partOfSpeech: "zelfstandig naamwoord", partOfSpeechCode: "zn" },
      { partOfSpeech: "zelfstandig naamwoord", partOfSpeechCode: "zn" },
      { partOfSpeech: "zelfstandig naamwoord", partOfSpeechCode: "zn" },
    ]);

    for (const item of prepared) {
      const payload = JSON.parse(item.messages[1].content);
      expect(payload).toMatchObject({
        targetLanguageCode: "ru",
        texts: item.texts,
        responseFormat: {
          translations: ["string"],
          literalTranslations: ["string"],
          note: "string | null",
        },
      });
    }
  });

  test("prepares a network-free dry run for the complete goed group", () => {
    const run = prepareTranslationEvalRun(translationEvalCases, {
      casePrefix: "goed_zn_",
    });

    expect(run).toHaveLength(3);
    expect(run.map((item) => item.id)).toEqual([
      "goed_zn_goods",
      "goed_zn_moral_good",
      "goed_zn_cloth",
    ]);
    expect(run.every((item) => item.messages.length === 2)).toBe(true);
  });

  test("binds each goed case to a different exact meaning request", () => {
    const prepared = translationEvalCases
      .filter((item) => item.id.startsWith("goed_zn_"))
      .map(prepareDictionaryMeaningEvalCase);

    expect(prepared.map((item) => item.request.entryId)).toEqual([
      "eval:goed_zn_goods",
      "eval:goed_zn_moral_good",
      "eval:goed_zn_cloth",
    ]);
    expect(prepared.map((item) => item.request.content[0].text)).toEqual([
      "de dingen; de voorwerpen",
      "dat wat goed is",
      "de stof; de kleren",
    ]);
  });
});
