import { describe, expect, test } from "vitest";
import {
  prepareTranslationEvalCase,
  prepareDictionaryMeaningEvalCase,
  evaluateDictionaryMeaningPrimaryText,
  prepareTranslationEvalRun,
} from "@/scripts/translationEvalHarness";
import { translationEvalCases } from "@/scripts/translationEvalCases";

describe("translation evaluation harness", () => {
  test("rejects the captured generic typisch primary and accepts the selected sense", () => {
    const item = translationEvalCases.find(
      (candidate) => candidate.id === "typisch_bn_strange",
    )!;

    expect(
      evaluateDictionaryMeaningPrimaryText("типичный", item.expectations),
    ).toMatchObject({
      status: "evaluated",
      passed: false,
      forbiddenSensesPresent: [
        "typical or characteristic as the primary sense",
      ],
    });
    expect(
      evaluateDictionaryMeaningPrimaryText("странный", item.expectations),
    ).toEqual({
      status: "evaluated",
      passed: true,
      missingRequiredSemanticUnits: [],
      forbiddenSensesPresent: [],
    });
  });

  test("executes the declared semantic rules for neighboring goed meanings", () => {
    const cases = Object.fromEntries(
      translationEvalCases
        .filter((item) => item.id.startsWith("goed_zn_"))
        .map((item) => [item.id, item]),
    );

    expect(
      evaluateDictionaryMeaningPrimaryText(
        "товары",
        cases.goed_zn_goods.expectations,
      ),
    ).toMatchObject({ status: "evaluated", passed: true });
    expect(
      evaluateDictionaryMeaningPrimaryText(
        "добро",
        cases.goed_zn_goods.expectations,
      ),
    ).toMatchObject({
      status: "evaluated",
      passed: false,
      forbiddenSensesPresent: ["moral good"],
    });

    expect(
      evaluateDictionaryMeaningPrimaryText(
        "благо",
        cases.goed_zn_moral_good.expectations,
      ),
    ).toMatchObject({ status: "evaluated", passed: true });
    expect(
      evaluateDictionaryMeaningPrimaryText(
        "товары",
        cases.goed_zn_moral_good.expectations,
      ),
    ).toMatchObject({
      status: "evaluated",
      passed: false,
      forbiddenSensesPresent: ["goods or merchandise"],
    });

    expect(
      evaluateDictionaryMeaningPrimaryText(
        "бельё",
        cases.goed_zn_cloth.expectations,
      ),
    ).toMatchObject({ status: "evaluated", passed: true });
    expect(
      evaluateDictionaryMeaningPrimaryText(
        "добро",
        cases.goed_zn_cloth.expectations,
      ),
    ).toMatchObject({
      status: "evaluated",
      passed: false,
      forbiddenSensesPresent: ["moral good"],
    });
  });

  test("reports an unevaluated primary rule instead of a vacuous pass", () => {
    const item = translationEvalCases.find(
      (candidate) => candidate.id === "kermis_idiom_not_literal",
    )!;

    expect(
      evaluateDictionaryMeaningPrimaryText("ярмарка", item.expectations),
    ).toEqual({ status: "not-configured" });
  });

  test("rebuilds the exact current typisch meaning request", () => {
    const item = translationEvalCases.find(
      (candidate) => candidate.id === "typisch_bn_strange",
    )!;
    const prepared = prepareDictionaryMeaningEvalCase(item);

    expect(prepared.request).toMatchObject({
      entryId: "1b636b1b-0ba1-4f29-a52d-0b45fdbaba8d",
      sourceContentFingerprint:
        "221be689c6ff0b006999786b41d60d36cab5fff2011034949368fc7af3c6fbb9",
      sourceLanguageCode: "nl",
      targetLanguageCode: "ru",
      headword: { text: "typisch", partOfSpeechCode: "bn" },
      content: [
        {
          fieldId: "definition",
          role: "definition",
          text: "iets wat typisch is, is vreemd",
        },
        {
          fieldId: "example:0",
          role: "example",
          text: "wat typisch dat we elkaar niet gezien hebben op dat congres!",
        },
      ],
    });
  });

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
