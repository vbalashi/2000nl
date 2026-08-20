import { describe, expect, test } from "vitest";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import {
  singleSenseEntry,
  singleSenseGroup,
} from "./platformV2TrainingFixture";
import {
  goedEntry,
  goedGroup,
  nodigEntry,
  nodigGroup,
} from "./platformV2IdiomHierarchyFixture";

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

  test("counts the two nodig expressions instead of four flattened idiom nodes", () => {
    const model = buildTrainingSenseCardModel({
      group: nodigGroup,
      entry: nodigEntry,
      interfaceLanguage: "nl",
    });
    const idioms = model.examples.filter((item) => item.kind === "idiom");

    expect(idioms).toHaveLength(2);
    expect(idioms.map((item) => item.text)).toEqual([
      "ik moet nodig",
      "hij moest zo nodig alleen naar huis fietsen",
    ]);
    expect(idioms.map((item) => item.children.map((child) => child.text))).toEqual([
      ["ik voel dat ik dringend naar de wc moet"],
      ["hij wilde het, maar het was niet verstandig"],
    ]);
  });

  test("keeps the goed explanation and example owned by their expression after reorder", () => {
    const model = buildTrainingSenseCardModel({
      group: goedGroup,
      entry: goedEntry,
      interfaceLanguage: "nl",
    });
    const idiom = model.examples.find((item) => item.contentNodeId === "idiom-goed");

    expect(idiom).toEqual(
      expect.objectContaining({
        parentContentNodeId: null,
        text: "iets komt ten goede aan iemand of iets",
        children: [
          expect.objectContaining({
            contentNodeId: "idiom-explanation-goed",
            parentContentNodeId: "idiom-goed",
            kind: "idiom-explanation",
          }),
          expect.objectContaining({
            contentNodeId: "idiom-example-goed",
            parentContentNodeId: "idiom-goed",
            kind: "example",
          }),
        ],
      }),
    );
  });

  test("keeps structured entry alternatives separate from the primary text", () => {
    const model = buildTrainingSenseCardModel({
      group: singleSenseGroup,
      entry: {
        ...singleSenseEntry,
        translation: {
          ...singleSenseEntry.translation!,
          alternativeTexts: ["palm", "mitt"],
        },
      },
      interfaceLanguage: "en",
    });

    expect(model.entryTranslation).toBe("hand");
    expect(model.entryTranslationAlternatives).toEqual(["palm", "mitt"]);
  });
});
