import type { TrainingSetupDraft } from "./types";

export type TrainingSetupPreset = { id: string; name: string; draft: TrainingSetupDraft };
export type SavedTraining = TrainingSetupPreset & { languageCode: string };
export type TrainingSetupsDocument = {
  schemaVersion: 1;
  trainings: SavedTraining[];
  mainTrainingId: string | null;
};
export type TrainingSetupsSnapshot = { revision: number; document: TrainingSetupsDocument };
export const MAX_SAVED_TRAININGS = 100;
export const MAX_TRAINING_SETUPS_BYTES = 200_000;
export const emptyTrainingSetups = (): TrainingSetupsSnapshot => ({
  revision: 0, document: { schemaVersion: 1, trainings: [], mainTrainingId: null },
});

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number, nonempty = false): value is string =>
  typeof value === "string" && value.length <= max && (!nonempty || value.trim().length > 0);
const integer = (value: unknown, max = 10000): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max;
const optionalArray = (value: unknown, allowed: readonly string[], max: number) =>
  value === undefined || (Array.isArray(value) && value.length <= max &&
    new Set(value).size === value.length && value.every(item => typeof item === "string" && allowed.includes(item)));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure validation independent of rendering and persistence. */
export function isTrainingSetupDraft(value: unknown): value is TrainingSetupDraft {
  if (!record(value)) return false;
  const family = value.family ?? "meaning";
  if (!["meaning", "idiom", "sentence", "word-in-context"].includes(String(family))) return false;
  const scenario = family === "idiom" ? "idiom" : family === "sentence" ? "sentences" : "understanding";
  if (value.scenarioId !== scenario || !Array.isArray(value.modes) || !value.modes.length ||
      !optionalArray(value.modes, ["word-to-definition", "definition-to-word"], 2)) return false;
  if (family === "word-in-context" && (value.modes.length !== 1 || value.modes[0] !== "definition-to-word")) return false;
  if (!["new", "review", "both"].includes(String(value.cardFilter)) ||
      !integer(value.newReviewRatio, 100) || !["all", "today", "yesterday", "daysAgo"].includes(String(value.dateWindow)) ||
      (value.dateWindow === "daysAgo" && !integer(value.daysAgo, 36500)) ||
      (value.daysAgo !== undefined && !integer(value.daysAgo, 36500)) ||
      !text(value.listValue, 512) || !text(value.sourceValue, 512)) return false;
  if (!(family === "meaning" && value.sessionSize === "all-due-today") && !integer(value.sessionSize)) return false;
  if (value.materialMode !== undefined && !["collection", "all-dictionaries", "selected-dictionaries"].includes(String(value.materialMode))) return false;
  if (value.dictionaryIds !== undefined && (!Array.isArray(value.dictionaryIds) || value.dictionaryIds.length > 100 ||
      new Set(value.dictionaryIds).size !== value.dictionaryIds.length ||
      !value.dictionaryIds.every(id => typeof id === "string" && uuid.test(id)))) return false;
  if (value.materialMode === "selected-dictionaries" && (!Array.isArray(value.dictionaryIds) || !value.dictionaryIds.length)) return false;
  return optionalArray(value.partOfSpeech, ["zn", "ww", "bn", "bw", "vz", "vnw", "vw", "tw", "lidw", "tsw", "afk"], 11) &&
    optionalArray(value.nounArticles, ["de", "het"], 2);
}

export function isTrainingSetupPreset(value: unknown): value is TrainingSetupPreset {
  return record(value) && text(value.id, 128, true) && text(value.name, 160, true) && isTrainingSetupDraft(value.draft);
}

// Reconstruct fields explicitly so storage cannot become an arbitrary payload bag.
export function canonicalDraft(value: TrainingSetupDraft): TrainingSetupDraft {
  return {
    ...(value.family !== undefined ? { family: value.family } : {}),
    scenarioId: value.scenarioId, modes: [...value.modes], cardFilter: value.cardFilter,
    listValue: value.listValue, newReviewRatio: value.newReviewRatio,
    dateWindow: value.dateWindow, sourceValue: value.sourceValue, sessionSize: value.sessionSize,
    ...(value.daysAgo !== undefined ? { daysAgo: value.daysAgo } : {}),
    ...(value.materialMode !== undefined ? { materialMode: value.materialMode } : {}),
    ...(value.dictionaryIds !== undefined ? { dictionaryIds: [...value.dictionaryIds] } : {}),
    ...(value.partOfSpeech !== undefined ? { partOfSpeech: [...value.partOfSpeech] } : {}),
    ...(value.nounArticles !== undefined ? { nounArticles: [...value.nounArticles] } : {}),
  };
}

export function parseTrainingSetupsDocument(value: unknown): TrainingSetupsDocument | null {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.trainings) ||
      value.trainings.length > MAX_SAVED_TRAININGS) return null;
  const trainings: SavedTraining[] = [];
  const ids = new Set<string>();
  for (const item of value.trainings) {
    const languageCode = record(item) ? item.languageCode : null;
    if (!isTrainingSetupPreset(item) || typeof languageCode !== "string" ||
        !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(languageCode) || languageCode.length > 35 || ids.has(item.id)) return null;
    ids.add(item.id);
    trainings.push({ id: item.id, name: item.name.trim(), languageCode, draft: canonicalDraft(item.draft) });
  }
  if (value.mainTrainingId !== null && (typeof value.mainTrainingId !== "string" || !ids.has(value.mainTrainingId))) return null;
  return { schemaVersion: 1, trainings, mainTrainingId: value.mainTrainingId as string | null };
}

export function parseTrainingSetupsSnapshot(value: unknown): TrainingSetupsSnapshot | null {
  if (!record(value) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0) return null;
  const document = parseTrainingSetupsDocument(value.document);
  return document ? { revision: value.revision, document } : null;
}
