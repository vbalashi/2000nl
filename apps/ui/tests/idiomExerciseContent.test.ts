import { describe, expect, test } from "vitest";
import { resolveIdiomExerciseContent } from "@/lib/training/idiomExerciseContent";
import {
  goedGroup,
  nodigGroup,
} from "./platformV2IdiomHierarchyFixture";

const target = (entryId: string, contentNodeId: string) => ({
  entryId,
  contentNodeId,
  sourceTextFingerprint: `fingerprint-${contentNodeId}`,
});

describe("idiom exercise content", () => {
  test("selects only the requested expression and its owned explanation/examples", () => {
    const content = resolveIdiomExerciseContent(
      target("entry-nodig", "idiom-nodig-2"),
      nodigGroup,
    );

    expect(content?.headword).toBe("nodig");
    expect(content?.expression.text).toBe("hij moest zo nodig alleen naar huis fietsen");
    expect(content?.explanation.text).toBe("hij wilde het, maar het was niet verstandig");
    expect(content?.examples).toEqual([]);
    expect(content?.entry.entryId).toBe("entry-nodig");
  });

  test("keeps nested examples separate from ordinary meaning examples", () => {
    const content = resolveIdiomExerciseContent(
      target("entry-goed", "idiom-goed"),
      goedGroup,
    );

    expect(content?.examples.map((example) => example.text)).toEqual([
      "het geld dat we met deze actie verdienen, komt ten goede aan de slachtoffers van de brand",
    ]);
    expect(content?.examples.map((example) => example.contentNodeId)).toEqual([
      "idiom-example-goed",
    ]);
  });

  test("rejects a stale source fingerprint and a target from another entry", () => {
    expect(resolveIdiomExerciseContent({
      ...target("entry-goed", "idiom-goed"),
      sourceTextFingerprint: "changed-content",
    }, goedGroup)).toBeNull();
    expect(resolveIdiomExerciseContent(
      target("entry-nodig", "idiom-goed"),
      goedGroup,
    )).toBeNull();
  });

  test("rejects missing or ambiguous owned explanations without borrowing siblings", () => {
    const entry = goedGroup.entries[0];
    if (entry.kind !== "sense-card") throw new Error("fixture must contain a sense card");
    const explanation = entry.contentNodes.find(
      (node) => node.contentNodeId === "idiom-explanation-goed",
    );
    if (!explanation) throw new Error("fixture must contain an explanation");

    const withoutExplanation = {
      ...goedGroup,
      entries: [{
        ...entry,
        contentNodes: entry.contentNodes.filter(
          (node) => node.contentNodeId !== explanation.contentNodeId,
        ),
      }],
    };
    expect(resolveIdiomExerciseContent(
      target("entry-goed", "idiom-goed"),
      withoutExplanation,
    )).toBeNull();

    const ambiguous = {
      ...goedGroup,
      entries: [{
        ...entry,
        contentNodes: [
          ...entry.contentNodes,
          { ...explanation, contentNodeId: "second-explanation", order: 9 },
        ],
      }],
    };
    expect(resolveIdiomExerciseContent(
      target("entry-goed", "idiom-goed"),
      ambiguous,
    )).toBeNull();
  });
});
