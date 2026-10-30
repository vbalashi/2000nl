import type { TrainingSetupDraft } from "@/lib/training/setups/types";
import type { TrainingSessionSize } from "@/lib/types";
import { isTrainingSetupDraft, type SavedTraining } from "@/lib/training/setups/model";

export const JOURNEY_KEY = "2000nl:onboarding-preview:journey:v1";
export type PreviewCollection = { id: string; name: string; ownership?: "owned" | "received"; entryIds: string[] };
export type Journey = { version: 1; collections: PreviewCollection[]; trainings: SavedTraining[]; learnedEntryIds: string[] };
export const emptyJourney = (): Journey => ({ version: 1, collections: [], trainings: [], learnedEntryIds: [] });
type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object");

export function readJourney(storage: Storage): Journey {
  try {
    const value: unknown = JSON.parse(storage.getItem(JOURNEY_KEY) ?? "null");
    if (!record(value) || value.version !== 1 || !Array.isArray(value.collections) || !Array.isArray(value.trainings) || !Array.isArray(value.learnedEntryIds)) return emptyJourney();
    const collections = value.collections.filter((c): c is PreviewCollection => record(c) && typeof c.id === "string" && typeof c.name === "string" && c.name.trim().length > 0 && (c.ownership === undefined || c.ownership === "owned" || c.ownership === "received") && Array.isArray(c.entryIds) && c.entryIds.every(id => typeof id === "string")).slice(0, 50);
    const trainings = value.trainings.filter((t): t is SavedTraining => {
      if (!record(t) || typeof t.id !== "string" || typeof t.name !== "string" || !t.name.trim() || t.languageCode !== "nl") return false;
      const draft = t.draft;
      return isTrainingSetupDraft(draft) && collections.some(c => draft.listValue === `user:${c.id}`);
    }).slice(0, 50);
    return { version: 1, collections, trainings, learnedEntryIds: value.learnedEntryIds.filter((id): id is string => typeof id === "string") };
  } catch { return emptyJourney(); }
}
export function saveJourney(storage: Storage, value: Journey): boolean {
  try { storage.setItem(JOURNEY_KEY, JSON.stringify(value)); return true; } catch { return false; }
}
export function learnMeaning(journey: Journey, entryId: string): Journey {
  return { ...journey, learnedEntryIds: [...new Set([...journey.learnedEntryIds, entryId])] };
}
export function includeMeaning(journey: Journey, collectionId: string, entryId: string, include: boolean): Journey {
  return { ...journey, collections: journey.collections.map(c => c.id === collectionId ? { ...c, entryIds: include ? [...new Set([...c.entryIds, entryId])] : c.entryIds.filter(id => id !== entryId) } : c) };
}

export const previewDictionaryId = "00000000-0000-4000-8000-000000000009";
export const newPreviewDraft = (): TrainingSetupDraft & { sessionSize: TrainingSessionSize } => ({
  family: "meaning", scenarioId: "understanding", modes: ["word-to-definition"], cardFilter: "both",
  materialMode: "selected-dictionaries", dictionaryIds: [previewDictionaryId], listValue: "curated", sourceValue: "curated",
  newReviewRatio: 2, dateWindow: "all", sessionSize: 10,
});

