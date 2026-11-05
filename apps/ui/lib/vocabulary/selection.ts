/** UI selection contract. Corpus loading and server-side filtering are separate. */
export type FrequencyProfile = "spoken" | "written";
export type VocabularyMaterialKind = "word" | "expression" | "sentence";
export type MeaningLimit = 1 | 2 | 3 | "all";
export type VocabularySelection = {
  mode: "all" | "frequency";
  materialKinds: VocabularyMaterialKind[];
  profile: FrequencyProfile;
  from: number;
  to: number;
  meanings: MeaningLimit;
};
export const DEFAULT_VOCABULARY_SELECTION: VocabularySelection = {
  mode: "all", materialKinds: [], profile: "spoken", from: 1, to: 100, meanings: "all",
};
export const MEANING_LIMIT_STEPS: readonly MeaningLimit[] = [1, 2, 3, "all"];
export function validFrequencyRange(from: number, to: number) {
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 1 && to >= from;
}
export function frequencyRangeSteps(from: number, to: number): number[] {
  return [...new Set([1, 50, 100, 200, 500, 1000, 2000, 5000, 10000, from, to]
    .filter(rank => Number.isSafeInteger(rank) && rank >= 1))].sort((a, b) => a - b);
}
