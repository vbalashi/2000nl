import { describe, expect, test } from "vitest";
import { selectTrainingReversePrompt } from "@/lib/training/trainingReversePrompt";
import { projectPlatformV2SenseContent } from "@/lib/platform/projections/platformV2SenseContent";
import type { PlatformContentNodeKindV2 } from "../../../packages/shared/types/platformV2";
import { singleSenseEntry } from "./platformV2TrainingFixture";

function node(id: string, kind: PlatformContentNodeKindV2, text: string, parent: string | null = null) {
  return { ...singleSenseEntry.contentNodes[0], contentNodeId: id, kind, text, parentContentNodeId: parent };
}
function prompt(contentNodes: typeof singleSenseEntry.contentNodes) {
  return selectTrainingReversePrompt(projectPlatformV2SenseContent({ capabilities: [], contentNodes }).rootNodes);
}

describe("reverse prompt semantics", () => {
  test("prefers a non-empty definition over an idiom explanation", () => {
    expect(prompt([
      node("idiom", "idiom", "ergens helemaal klaar mee zijn"),
      node("explanation", "idiom-explanation", "explanation", "idiom"),
      node("empty", "definition", "  "),
      node("definition", "definition", "definition"),
    ])?.contentNodeId).toBe("definition");
  });
  test("preserves the explanation kind and binding even when input is reordered", () => {
    const selected = prompt([
      node("explanation", "idiom-explanation", "iets helemaal niet meer willen", "idiom"),
      node("example", "example", "example", "idiom"),
      node("idiom", "idiom", "ergens helemaal klaar mee zijn"),
    ]);
    expect(selected).toMatchObject({ contentNodeId: "explanation", kind: "idiom-explanation", parentContentNodeId: "idiom" });
  });
  test.each(["usage-pattern", "example", "usage-note", "idiom", "idiom-explanation"] as const)("does not turn standalone %s into a reverse prompt", (kind) => {
    expect(prompt([node("support", kind, "support text")])).toBeUndefined();
  });
  test("rejects orphan explanations, empty text and ambiguous multiple idioms", () => {
    expect(prompt([node("explanation", "idiom-explanation", "text", "missing")])).toBeUndefined();
    expect(prompt([node("definition", "definition", " \n ")])).toBeUndefined();
    const idiom = node("idiom", "idiom", "expression");
    expect(prompt([idiom, node("explanation", "idiom-explanation", "  ", "idiom")])).toBeUndefined();
    expect(prompt([idiom, node("explanation", "idiom-explanation", "text", "idiom"), node("other", "idiom", "another expression")])).toBeUndefined();
  });
});
