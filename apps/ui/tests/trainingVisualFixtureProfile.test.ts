import { describe, expect, test } from "vitest";
import {
  buildTrainingVisualFixtureBundle,
  trainingVisualStates,
} from "../playwright/support/trainingVisualFixtureProfile";

describe("Training visual fixture profile", () => {
  test("uses one typed state instead of combinable visual booleans", () => {
    expect(trainingVisualStates).toEqual([
      "face",
      "answer",
      "long-idiom",
      "recoverable-error",
    ]);
    expect(
      buildTrainingVisualFixtureBundle("long-idiom", [{ id: "entry-1" }])
        .profile.state,
    ).toBe(
      "long-idiom",
    );
  });

  test("matches the approved Dutch card while identifying English translations", () => {
    const profile = buildTrainingVisualFixtureBundle("answer", [
      { id: "entry-1" },
    ]).profile;

    expect(profile.interfaceLanguage).toBe("nl");
    expect(profile.translationTargetLanguageCode).toBe("en");
    expect(profile.entryTranslation.targetLanguageCode).toBe("en");
    expect(profile.definitionTranslation.targetLanguageCode).toBe("en");
  });

  test("owns lookup, plan, stats, and settings in one immutable bundle", () => {
    const bundle = buildTrainingVisualFixtureBundle("answer", [
      { id: "entry-1" },
    ]);

    expect(Object.isFrozen(bundle)).toBe(true);
    expect(bundle.lookupGroups["entry-1"]?.headwordGroupId).toBe(
      "group-entry-1",
    );
    expect(bundle.plan.plannedTotal).toBe(23);
    expect(bundle.stats.totalWordsInList).toBe(25);
    expect(bundle.settings.translation_lang).toBe("en");
  });
});
