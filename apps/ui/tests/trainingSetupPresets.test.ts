import { afterEach, expect, test } from "vitest";
import {
  presetStorageKey,
  readTrainingPresets,
  writeTrainingPresets,
} from "@/components/training/pilot/trainingSetupPresets";

afterEach(() => window.localStorage.clear());

test("presets are stored separately for each learner and training language", () => {
  const key = presetStorageKey("user-a", "nl");
  const presets = [{
    id: "preset-1",
    name: "VanDale 2k · words",
    draft: {
      scenarioId: "understanding",
      modes: ["word-to-definition" as const],
      cardFilter: "review" as const,
      listValue: "curated:nt2",
      newReviewRatio: 2,
      dateWindow: "all" as const,
      sourceValue: "all",
      sessionSize: 30,
    },
  }];

  expect(writeTrainingPresets(key, presets)).toBe(true);
  expect(readTrainingPresets(key)).toEqual(presets);
  expect(readTrainingPresets(presetStorageKey("user-b", "nl"))).toEqual([]);
  expect(readTrainingPresets(presetStorageKey("user-a", "en"))).toEqual([]);
});
