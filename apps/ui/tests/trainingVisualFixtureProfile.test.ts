import { describe, expect, test } from "vitest";
import {
  buildTrainingVisualFixtureProfile,
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
    expect(buildTrainingVisualFixtureProfile("long-idiom").state).toBe(
      "long-idiom",
    );
  });

  test("matches the approved Dutch card while identifying English translations", () => {
    const profile = buildTrainingVisualFixtureProfile("answer");

    expect(profile.interfaceLanguage).toBe("nl");
    expect(profile.translationTargetLanguageCode).toBe("en");
    expect(profile.entryTranslation.targetLanguageCode).toBe("en");
    expect(profile.definitionTranslation.targetLanguageCode).toBe("en");
  });
});
