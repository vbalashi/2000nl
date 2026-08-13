import { describe, expect, test } from "vitest";
import { translationEvalCases } from "@/scripts/translationEvalCases";

describe("translation evaluation cases", () => {
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
});
