import { describe, expect, test } from "vitest";
import {
  buildLibrarySenseCardGroupModel,
  librarySenseCardIdentity,
  reconcileLibrarySenseCardViewState,
} from "@/components/training/library-v2/librarySenseCardModel";
import {
  financeEntry,
  furnitureEntry,
  multiSenseBankGroup,
} from "./platformV2LibraryFixture";
import {
  goedEntry,
  goedGroup,
  nodigGroup,
} from "./platformV2IdiomHierarchyFixture";

describe("Library multi-sense model", () => {
  test("keeps the reordered goed explanation and example nested under the expression", () => {
    const model = buildLibrarySenseCardGroupModel(goedGroup, "nl");
    const idiom = model.meanings[0].details.find(
      (item) => item.contentNodeId === "idiom-goed",
    );

    expect(goedEntry.contentNodes[0].contentNodeId).toBe("idiom-example-goed");
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
  test("keeps two nodig expression roots with their own explanations", () => {
    const model = buildLibrarySenseCardGroupModel(nodigGroup, "nl");
    const idioms = model.meanings[0].details.filter(
      (item) => item.kind === "idiom",
    );

    expect(idioms).toHaveLength(2);
    expect(idioms.map((item) => item.children.map((child) => child.kind))).toEqual([
      ["idiom-explanation"],
      ["idiom-explanation"],
    ]);
  });
  test("keeps learning state and actions on their exact entry", () => {
    const model = buildLibrarySenseCardGroupModel(multiSenseBankGroup, "en");

    expect(model.meanings.map((meaning) => meaning.entryId)).toEqual([
      furnitureEntry.entryId,
      financeEntry.entryId,
    ]);
    expect(model.meanings[0]).toMatchObject({
      repeatCount: 3,
    });
    expect(model.meanings[0].reportCapability).toEqual(
      expect.objectContaining({
        actionId: "report-content",
        target: expect.objectContaining({ entryId: "entry-bank-furniture" }),
      }),
    );
    expect(model.meanings[1]).toMatchObject({
      repeatCount: 0,
    });
    expect(model.meanings[1].startLearning?.target.entryId).toBe(
      financeEntry.entryId,
    );
  });

  test("retains local disclosure state by entry identity after reorder", () => {
    const initialModel = buildLibrarySenseCardGroupModel(
      multiSenseBankGroup,
      "en",
    );
    const initial = reconcileLibrarySenseCardViewState(
      {},
      initialModel.meanings,
    );
    const financeIdentity = librarySenseCardIdentity(
      financeEntry.entryId,
      "word-to-definition",
    );
    const furnitureIdentity = librarySenseCardIdentity(
      furnitureEntry.entryId,
      "word-to-definition",
    );
    const changed = {
      ...initial,
      [financeIdentity]: {
        expanded: true,
        translationVisible: true,
      },
    };

    const reordered = reconcileLibrarySenseCardViewState(changed, [
      initialModel.meanings[1],
      initialModel.meanings[0],
    ]);

    expect(reordered[financeIdentity]).toEqual({
      expanded: true,
      translationVisible: true,
    });
    expect(reordered[furnitureIdentity]).toEqual({
      expanded: true,
      translationVisible: false,
    });
  });

  test("does not carry view state across card types for one entry", () => {
    const wordModel = buildLibrarySenseCardGroupModel(
      multiSenseBankGroup,
      "en",
      "word-to-definition",
    );
    const changed = reconcileLibrarySenseCardViewState({}, wordModel.meanings);
    const oldIdentity = librarySenseCardIdentity(
      furnitureEntry.entryId,
      "word-to-definition",
    );
    changed[oldIdentity] = { expanded: false, translationVisible: true };

    const reverseModel = buildLibrarySenseCardGroupModel(
      {
        ...multiSenseBankGroup,
        entries: multiSenseBankGroup.entries.map((entry) =>
          entry.kind === "sense-card" ? { ...entry, card: null } : entry,
        ),
      },
      "en",
      "definition-to-word",
    );
    const reconciled = reconcileLibrarySenseCardViewState(
      changed,
      reverseModel.meanings,
    );

    expect(
      reconciled[
        librarySenseCardIdentity(furnitureEntry.entryId, "definition-to-word")
      ],
    ).toEqual({ expanded: true, translationVisible: false });
  });

  test("does not show a meaning number for a single-sense group", () => {
    const model = buildLibrarySenseCardGroupModel(
      {
        ...multiSenseBankGroup,
        senseCount: 1,
        entryCount: 1,
        entries: [furnitureEntry],
      },
      "en",
    );

    expect(model.meanings[0].displayOrdinal).toBeNull();
  });

  test("keeps server-owned meaning count and entry-level part of speech", () => {
    const model = buildLibrarySenseCardGroupModel(
      {
        ...multiSenseBankGroup,
        senseCount: 3,
        header: { ...multiSenseBankGroup.header, partOfSpeech: undefined },
        entries: [
          ...multiSenseBankGroup.entries,
          {
            kind: "cross-reference" as const,
            crossReferenceId: "xref-bank",
            label: null,
            text: "bankieren",
            target: { query: "bankieren" },
            capabilities: [],
          },
        ],
      },
      "en",
    );

    expect(model.senseCount).toBe(3);
    expect(model.meanings).toHaveLength(2);
    expect(model.meanings[0].partOfSpeech).toBe("noun");
  });

  test("attaches reordered nested content by parent identity", () => {
    const model = buildLibrarySenseCardGroupModel(
      {
        ...multiSenseBankGroup,
        entries: multiSenseBankGroup.entries.map((entry, index) =>
          entry.kind === "sense-card" && index === 0
            ? {
                ...entry,
                contentNodes: [
                  entry.contentNodes[0],
                  {
                    contentNodeId: "explanation-second",
                    parentContentNodeId: "idiom-second",
                    kind: "idiom-explanation" as const,
                    order: 1,
                    text: "second explanation",
                    sourceTextFingerprint: "fp-explanation-second",
                    translations: [],
                  },
                  {
                    contentNodeId: "idiom-first",
                    parentContentNodeId: null,
                    kind: "idiom" as const,
                    order: 2,
                    text: "first idiom",
                    sourceTextFingerprint: "fp-idiom-first",
                    translations: [],
                  },
                  {
                    contentNodeId: "idiom-second",
                    parentContentNodeId: null,
                    kind: "idiom" as const,
                    order: 3,
                    text: "second idiom",
                    sourceTextFingerprint: "fp-idiom-second",
                    translations: [],
                  },
                  {
                    contentNodeId: "explanation-first",
                    parentContentNodeId: "idiom-first",
                    kind: "idiom-explanation" as const,
                    order: 4,
                    text: "first explanation",
                    sourceTextFingerprint: "fp-explanation-first",
                    translations: [],
                  },
                ],
              }
            : entry,
        ),
      },
      "en",
    );

    const idioms = model.meanings[0].details.filter(
      (detail) => detail.kind === "idiom",
    );
    expect(idioms.map((idiom) => idiom.text)).toEqual([
      "first idiom",
      "second idiom",
    ]);
    expect(idioms[0].children.map((child) => child.text)).toEqual([
      "first explanation",
    ]);
    expect(idioms[1].children.map((child) => child.text)).toEqual([
      "second explanation",
    ]);
  });
});
