import { describe, expect, test } from "vitest";
import { emptyJourney, newPreviewDraft, includeMeaning, learnMeaning, readJourney, saveJourney } from "@/app/dev/onboarding-preview/journeyState";

describe("onboarding journey preview", () => {
  test("collection membership references one meaning and preserves learning across collections", () => {
    const original = learnMeaning({ ...emptyJourney(), collections: [
      { id: "a", name: "First", entryIds: [] }, { id: "b", name: "Second", entryIds: [] },
    ] }, "meaning-furniture");
    const next = includeMeaning(includeMeaning(original, "a", "meaning-furniture", true), "b", "meaning-furniture", true);
    expect(next.collections.map(c => c.entryIds)).toEqual([["meaning-furniture"], ["meaning-furniture"]]);
    expect(next.collections.flatMap(c => c.entryIds)).not.toContain("meaning-finance");
    expect(next.learnedEntryIds).toEqual(original.learnedEntryIds);
    expect(learnMeaning(next, "meaning-furniture").learnedEntryIds).toEqual(["meaning-furniture"]);
  });

  test("named collection and training draft survive roundtrip without making a new primary", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const journey = { ...emptyJourney(), collections: [{ id: "a", name: "My meanings", entryIds: ["meaning-finance"] }],
      trainings: [{ id: "training-a", name: "My collection training", languageCode: "nl", draft: { ...newPreviewDraft(), materialMode: "collection" as const, listValue: "user:a", modes: ["definition-to-word" as const] } }] };
    expect(saveJourney(storage, journey)).toBe(true);
    expect(readJourney(storage)).toEqual(journey);
    expect(readJourney(storage)).not.toHaveProperty("mainTrainingId");
    expect(Object.keys(readJourney(storage))).not.toContain("preferences");
  });

  test("corrupt or incompatible persisted objects are not used as saved training data", () => {
    expect(readJourney({ getItem: () => "broken", setItem: () => {} })).toEqual(emptyJourney());
    const value = { ...emptyJourney(), trainings: [{ id: "bad", name: "Bad", languageCode: "nl", draft: { ...newPreviewDraft(), materialMode: "collection", listValue: "user:missing" } }] };
    expect(readJourney({ getItem: () => JSON.stringify(value), setItem: () => {} }).trainings).toEqual([]);
  });

  test("a failed local write never reports a successful save", () => {
    expect(saveJourney({ getItem: () => null, setItem: () => { throw new Error("denied"); } }, emptyJourney())).toBe(false);
  });
});
