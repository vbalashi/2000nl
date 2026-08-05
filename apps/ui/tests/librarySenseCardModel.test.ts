import { describe, expect, test } from "vitest";
import {
  buildLibrarySenseCardGroupModel,
  reconcileLibrarySenseCardViewState,
} from "@/components/training/library-v2/librarySenseCardModel";
import {
  financeEntry,
  furnitureEntry,
  multiSenseBankGroup,
} from "./platformV2LibraryFixture";

describe("Library multi-sense model", () => {
  test("keeps learning state and actions on their exact entry", () => {
    const model = buildLibrarySenseCardGroupModel(
      multiSenseBankGroup,
      "en",
    );

    expect(model.meanings.map((meaning) => meaning.entryId)).toEqual([
      furnitureEntry.entryId,
      financeEntry.entryId,
    ]);
    expect(model.meanings[0]).toMatchObject({
      phase: "reviewing",
      repeatCount: 3,
    });
    expect(model.meanings[0].reviewActions).toHaveLength(4);
    expect(model.meanings[1]).toMatchObject({
      phase: "not-started",
      repeatCount: 0,
    });
    expect(model.meanings[1].startLearning?.target.entryId).toBe(
      financeEntry.entryId,
    );
  });

  test("retains local disclosure state by entry identity after reorder", () => {
    const initial = reconcileLibrarySenseCardViewState({}, [
      furnitureEntry,
      financeEntry,
    ]);
    const changed = {
      ...initial,
      [financeEntry.entryId]: {
        expanded: true,
        translationVisible: true,
      },
    };

    const reordered = reconcileLibrarySenseCardViewState(changed, [
      financeEntry,
      furnitureEntry,
    ]);

    expect(reordered[financeEntry.entryId]).toEqual({
      expanded: true,
      translationVisible: true,
    });
    expect(reordered[furnitureEntry.entryId]).toEqual({
      expanded: true,
      translationVisible: false,
    });
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
});
