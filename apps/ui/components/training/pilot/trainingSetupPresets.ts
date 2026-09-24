import type { TrainingSetupDraft } from "./TrainingTodaySetup";

export type TrainingSetupPreset = {
  id: string;
  name: string;
  draft: TrainingSetupDraft;
};

const STORAGE_PREFIX = "2000nl.training.presets.v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const validPartOfSpeech = (value: unknown) =>
  ["zn", "ww", "bn", "bw", "vz", "vnw", "vw", "tw", "lidw", "tsw", "afk"].includes(String(value));
const validNounArticle = (value: unknown) => value === "de" || value === "het";

export const presetStorageKey = (userId: string, languageCode: string) =>
  `${STORAGE_PREFIX}.${userId}.${languageCode}`;

export function readTrainingPresets(key: string): TrainingSetupPreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is TrainingSetupPreset =>
        typeof item?.id === "string" &&
        typeof item?.name === "string" &&
        item?.draft?.scenarioId === "understanding" &&
        Array.isArray(item?.draft?.modes) &&
        item.draft.modes.length > 0 &&
        item.draft.modes.every(
          (mode: unknown) =>
            mode === "word-to-definition" || mode === "definition-to-word",
        ) &&
        ["new", "review", "both"].includes(item.draft.cardFilter) &&
        Number.isInteger(item.draft.newReviewRatio) &&
        item.draft.newReviewRatio > 0 &&
        ["all", "today", "yesterday", "daysAgo"].includes(item.draft.dateWindow) &&
        typeof item?.draft?.listValue === "string" &&
        (item.draft.materialMode === undefined ||
          item.draft.materialMode === "collection" ||
          item.draft.materialMode === "all-dictionaries" ||
          (item.draft.materialMode === "selected-dictionaries" &&
            Array.isArray(item.draft.dictionaryIds) &&
            item.draft.dictionaryIds.length > 0 &&
            item.draft.dictionaryIds.every((id: unknown) => typeof id === "string" && UUID_PATTERN.test(id)))) &&
        typeof item?.draft?.sourceValue === "string" &&
        (item.draft.partOfSpeech === undefined ||
          (Array.isArray(item.draft.partOfSpeech) &&
            item.draft.partOfSpeech.every(validPartOfSpeech))) &&
        (item.draft.nounArticles === undefined ||
          (Array.isArray(item.draft.nounArticles) &&
            item.draft.nounArticles.every(validNounArticle))) &&
        (item.draft.sessionSize === "all-due-today" ||
          (typeof item.draft.sessionSize === "number" &&
            Number.isInteger(item.draft.sessionSize) &&
            item.draft.sessionSize > 0)),
    );
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
