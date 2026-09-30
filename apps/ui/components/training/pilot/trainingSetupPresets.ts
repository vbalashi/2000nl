import { isTrainingSetupPreset, type TrainingSetupPreset } from "@/lib/training/setups/model";
export type { TrainingSetupPreset } from "@/lib/training/setups/model";

const STORAGE_PREFIX = "2000nl.training.presets.v1";
export const presetStorageKey = (userId: string, languageCode: string) =>
  `${STORAGE_PREFIX}.${userId}.${languageCode}`;

/** Temporary browser compatibility until the account UI port replaces this helper. */
export function readTrainingPresets(key: string): TrainingSetupPreset[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter(isTrainingSetupPreset) : [];
  } catch {
    return [];
  }
}

export function writeTrainingPresets(
  key: string,
  presets: TrainingSetupPreset[],
): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
}
