import { describe, expect, test } from "vitest";
import { translationEvalCases } from "@/scripts/translationEvalCases";

describe("translation evaluation cases", () => {
  test("pins the production typisch meaning and deterministic primary-sense rule", () => {
    const item = translationEvalCases.find(
      (candidate) => candidate.id === "typisch_bn_strange",
    );

    expect(item).toMatchObject({
      entryId: "1b636b1b-0ba1-4f29-a52d-0b45fdbaba8d",
      sourceContentFingerprint:
        "221be689c6ff0b006999786b41d60d36cab5fff2011034949368fc7af3c6fbb9",
      word: {
        headword: "typisch",
        part_of_speech: "bn",
        raw: {
          meanings: [
            {
              definition: "iets wat typisch is, is vreemd",
              examples: [
                "wat typisch dat we elkaar niet gezien hebben op dat congres!",
              ],
            },
          ],
        },
      },
      expectations: {
        requiredSemanticUnits: ["strange, unusual, or remarkable"],
        forbiddenSenses: ["typical or characteristic as the primary sense"],
      },
    });
  });

  test("keeps three noun senses of goed distinct", () => {
    const cases = translationEvalCases.filter((item) =>
      item.id.startsWith("goed_zn_"),
    );

    expect(cases).toHaveLength(3);
    expect(
      cases.map((item) => ({
        headword: item.word.headword,
        partOfSpeech: item.word.part_of_speech,
        definition: item.word.raw.meanings[0].definition,
        required: item.expectations.requiredSemanticUnits,
        forbidden: item.expectations.forbiddenSenses,
      })),
    ).toEqual([
      {
        headword: "goed",
        partOfSpeech: "zn",
        definition: "de dingen; de voorwerpen",
        required: ["goods, things, objects, or possessions"],
        forbidden: ["moral good", "adjectival good", "clothes or textile"],
      },
      {
        headword: "goed",
        partOfSpeech: "zn",
        definition: "dat wat goed is",
        required: ["moral good or benefit"],
        forbidden: ["goods or merchandise", "clothes or textile"],
      },
      {
        headword: "goed",
        partOfSpeech: "zn",
        definition: "de stof; de kleren",
        required: ["clothes, laundry, cloth, or textile"],
        forbidden: ["moral good", "goods or merchandise"],
      },
    ]);
  });

  test("binds executable primary rules to the declared semantic rubric", () => {
    const cases = translationEvalCases.filter(
      (item) => item.id === "typisch_bn_strange" || item.id.startsWith("goed_zn_"),
    );

    for (const item of cases) {
      expect(item.expectations.primaryText).toBeDefined();
      for (const rule of item.expectations.primaryText!.required) {
        expect(item.expectations.requiredSemanticUnits).toContain(
          rule.semanticUnit,
        );
      }
      for (const rule of item.expectations.primaryText!.forbidden) {
        expect(item.expectations.forbiddenSenses).toContain(rule.sense);
      }
    }
  });
});
