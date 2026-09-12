import { describe, expect, test } from "vitest";
import { evaluateTrainingCardRenderability } from "@/lib/training/trainingCardRenderability";
import { singleSenseEntry } from "./platformV2TrainingFixture";

describe("training card renderability", () => {
  test("requires an owned root example for direct recall of a later ordinary meaning", () => {
    const sparseLaterMeaning = {
      ...singleSenseEntry,
      meaningOrdinal: 2,
      contentNodes: singleSenseEntry.contentNodes.filter(
        (node) => node.kind !== "example",
      ),
    };

    expect(
      evaluateTrainingCardRenderability(sparseLaterMeaning, "word-to-definition"),
    ).toEqual({ renderable: false, reason: "direct-example-missing" });
    expect(
      evaluateTrainingCardRenderability(sparseLaterMeaning, "definition-to-word"),
    ).toEqual({ renderable: true });
  });

  test("does not borrow an idiom child as an ordinary example", () => {
    const laterMeaningWithOnlyNestedIdiomExample = {
      ...singleSenseEntry,
      meaningOrdinal: 2,
      contentNodes: [
        singleSenseEntry.contentNodes[0],
        {
          ...singleSenseEntry.contentNodes[1],
          contentNodeId: "idiom",
          parentContentNodeId: null,
          kind: "idiom" as const,
          text: "an owned idiom",
        },
        {
          ...singleSenseEntry.contentNodes[1],
          contentNodeId: "idiom-example",
          parentContentNodeId: "idiom",
        },
      ],
    };

    expect(
      evaluateTrainingCardRenderability(
        laterMeaningWithOnlyNestedIdiomExample,
        "word-to-definition",
      ),
    ).toEqual({ renderable: false, reason: "direct-example-missing" });
  });

  test("retains direct compatibility for idiom-only and first ordinary meanings", () => {
    const idiomOnly = {
      ...singleSenseEntry,
      meaningOrdinal: 2,
      contentNodes: singleSenseEntry.contentNodes.filter(
        (node) => node.kind !== "definition" && node.kind !== "example"),
    };
    const firstSparseMeaning = {
      ...singleSenseEntry,
      contentNodes: singleSenseEntry.contentNodes.filter(
        (node) => node.kind !== "example"),
    };

    expect(
      evaluateTrainingCardRenderability(idiomOnly, "word-to-definition"),
    ).toEqual({ renderable: true });
    expect(
      evaluateTrainingCardRenderability(firstSparseMeaning, "word-to-definition"),
    ).toEqual({ renderable: true });
  });
});
