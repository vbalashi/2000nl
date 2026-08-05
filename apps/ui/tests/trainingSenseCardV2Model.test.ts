import { describe, expect, test } from "vitest";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import {
  singleSenseEntry,
  singleSenseGroup,
} from "./platformV2TrainingFixture";

describe("buildTrainingSenseCardModel", () => {
  test("projects one exact semantic entry without ordinal or positional joins", () => {
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: singleSenseEntry,
      interfaceLanguage: "nl",
    });

    expect(model).toEqual(
      expect.objectContaining({
        entryId: "entry-hand-1",
        headword: "hand",
        article: "de",
        partOfSpeech: "zelfstandig naamwoord",
        coreVocabularyLabel: "2K",
        entryTranslation: "hand",
        repeatCount: 3,
        isKnown: false,
      }),
    );
    expect(model.definitions).toEqual([
      expect.objectContaining({
        contentNodeId: "definition-1",
        text: "het einde van je arm, waar je vingers aan zitten",
        translation: "the end of your arm, where your fingers are attached",
      }),
    ]);
    expect(model.examples).toEqual([
      expect.objectContaining({
        contentNodeId: "example-1",
        text: "Ze hield de brief stevig in haar hand.",
        translation: "She held the letter firmly in her hand.",
      }),
    ]);
    expect(model.reviewCapabilities.map((item) => item.reviewResult)).toEqual([
      "fail",
      "hard",
      "success",
      "easy",
    ]);
    expect("meaningOrdinal" in model).toBe(false);
  });

  test("does not invent a noun label when part of speech is absent", () => {
    const model = buildTrainingSenseCardModel({
      group: {
        ...singleSenseGroup,
        header: { ...singleSenseGroup.header, partOfSpeech: undefined },
      },
      entry: { ...singleSenseEntry, partOfSpeech: undefined },
      interfaceLanguage: "nl",
    });

    expect(model.partOfSpeech).toBeUndefined();
  });
});
