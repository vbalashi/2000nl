import { describe, expect, test } from "vitest";
import {
  localizePlatformSemanticTerm,
  projectPlatformV2SenseContent,
} from "@/lib/platform/projections/platformV2SenseContent";
import { buildTrainingSenseCardModel } from "@/components/training/v2/trainingSenseCardModel";
import { buildLibrarySenseCardGroupModel } from "@/components/training/library-v2/librarySenseCardModel";
import {
  goedEntry,
  goedGroup,
  nodigEntry,
} from "./platformV2IdiomHierarchyFixture";

describe("Platform V2 shared SenseCard content projection", () => {
  test("owns reversed-order hierarchy and exact node report capabilities", () => {
    const projection = projectPlatformV2SenseContent(goedEntry);
    const idiom = projection.rootNodes.find(
      (node) => node.contentNodeId === "idiom-goed",
    );

    expect(projection.orderedNodes.map((node) => node.contentNodeId)).toEqual([
      "definition-entry-goed",
      "example-goed",
      "idiom-goed",
      "idiom-explanation-goed",
      "idiom-example-goed",
    ]);
    expect(idiom).toMatchObject({
      kind: "idiom",
      reportCapability: {
        actionId: "report-content",
        target: { contentNodeId: "idiom-goed" },
      },
      children: [
        {
          contentNodeId: "idiom-explanation-goed",
          kind: "idiom-explanation",
          parentContentNodeId: "idiom-goed",
        },
        {
          contentNodeId: "idiom-example-goed",
          kind: "example",
          parentContentNodeId: "idiom-goed",
        },
      ],
    });
  });

  test("keeps two nodig expression roots and binds only ready translations", () => {
    const firstIdiomId = "idiom-nodig-1";
    const projection = projectPlatformV2SenseContent({
      ...nodigEntry,
      contentNodes: nodigEntry.contentNodes.map((node) =>
        node.contentNodeId === firstIdiomId
          ? {
              ...node,
              translations: [
                {
                  translationId: "pending",
                  targetLanguageCode: "en",
                  status: "pending" as const,
                  text: "must not render",
                  sourceTextFingerprint: node.sourceTextFingerprint,
                  translationPolicyVersion: "test",
                },
                {
                  translationId: "ready",
                  targetLanguageCode: "en",
                  status: "ready" as const,
                  text: "I urgently need to go",
                  sourceTextFingerprint: node.sourceTextFingerprint,
                  translationPolicyVersion: "test",
                },
              ],
            }
          : node,
      ),
    });
    const idioms = projection.rootNodes.filter((node) => node.kind === "idiom");

    expect(idioms).toHaveLength(2);
    expect(idioms[0].translation).toBe("I urgently need to go");
    expect(idioms.map((node) => node.children.map((child) => child.kind))).toEqual([
      ["idiom-explanation"],
      ["idiom-explanation"],
    ]);
  });

  test("uses the source term when a client message key is unknown", () => {
    expect(
      localizePlatformSemanticTerm(
        {
          termId: "part-of-speech.future",
          messageKey: "partOfSpeech.future",
          sourceValue: "future source label",
        },
        "en",
      ),
    ).toBe("future source label");
    expect(
      localizePlatformSemanticTerm(
        {
          termId: "part-of-speech.future",
          messageKey: "partOfSpeech.future",
        },
        "en",
      ),
    ).toBeNull();
  });

  test("keeps Library and Training on the same semantic tree and POS fallback", () => {
    const unknownPartOfSpeech = {
      termId: "part-of-speech.future",
      messageKey: "partOfSpeech.future",
      sourceValue: "future source label",
    };
    const entry = { ...goedEntry, partOfSpeech: unknownPartOfSpeech };
    const group = {
      ...goedGroup,
      header: { ...goedGroup.header, partOfSpeech: unknownPartOfSpeech },
      entries: [entry],
    };
    const training = buildTrainingSenseCardModel({
      group,
      entry,
      interfaceLanguage: "en",
    });
    const library = buildLibrarySenseCardGroupModel(group, "en");

    expect(training.partOfSpeech).toBe("future source label");
    expect(library.partOfSpeech).toBe("future source label");
    expect(library.meanings[0].partOfSpeech).toBe("future source label");
    expect([library.meanings[0].definition, ...library.meanings[0].details]).toEqual([
      ...training.definitions,
      ...training.examples,
    ]);
  });

  test("keeps stale node text out of both Library and Training projections", () => {
    const staleNodeId = "definition-entry-goed";
    const readyNodeId = "idiom-goed";
    const entry = {
      ...goedEntry,
      contentNodes: goedEntry.contentNodes.map((node) => {
        if (node.contentNodeId === staleNodeId) {
          return {
            ...node,
            translations: [
              {
                translationId: "stale-definition",
                targetLanguageCode: "en",
                status: "not-available" as const,
                text: "stale text must not render",
                sourceTextFingerprint: node.sourceTextFingerprint,
                translationPolicyVersion: "old-policy",
              },
            ],
          };
        }
        if (node.contentNodeId === readyNodeId) {
          return {
            ...node,
            translations: [
              {
                translationId: "ready-idiom",
                targetLanguageCode: "en",
                status: "ready" as const,
                text: "something benefits someone",
                sourceTextFingerprint: node.sourceTextFingerprint,
                translationPolicyVersion: "current-policy",
              },
            ],
          };
        }
        return node;
      }),
    };
    const group = { ...goedGroup, entries: [entry] };
    const training = buildTrainingSenseCardModel({
      group,
      entry,
      interfaceLanguage: "en",
    });
    const library = buildLibrarySenseCardGroupModel(group, "en");
    const trainingStale = training.definitions.find(
      (node) => node.contentNodeId === staleNodeId,
    );
    const libraryStale = library.meanings[0].definition;
    const trainingReady = training.examples.find(
      (node) => node.contentNodeId === readyNodeId,
    );
    const libraryReady = library.meanings[0].details.find(
      (node) => node.contentNodeId === readyNodeId,
    );

    expect(trainingStale?.translation).toBeUndefined();
    expect(libraryStale?.translation).toBeUndefined();
    expect(trainingReady?.translation).toBe("something benefits someone");
    expect(libraryReady?.translation).toBe("something benefits someone");
    expect([library.meanings[0].definition, ...library.meanings[0].details]).toEqual([
      ...training.definitions,
      ...training.examples,
    ]);
  });
});
