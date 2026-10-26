import { canonicalDraft, isTrainingSetupDraft } from "../setups/model";
import type { TrainingSetupDraft } from "../setups/types";
import { trainingFilterKey } from "../trainingFilterIdentity";
import type { TrainingFocusFilter } from "@/lib/types";

export type TrainingAvailabilityRecipe = { languageCode: string; draft: TrainingSetupDraft };
export type TrainingAvailability = {
  dueToday: number; totalReviews: number; newCards: number;
  studyDay: string; timezone: string; asOf: string;
};
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const draftKeys = ["family", "scenarioId", "modes", "cardFilter", "listValue", "materialMode", "dictionaryIds", "newReviewRatio", "dateWindow", "daysAgo", "sourceValue", "sessionSize", "partOfSpeech", "nounArticles"];

/** The principal is never accepted in the request. Recipe fields are preferences only. */
export function parseAvailabilityRecipe(value: unknown): TrainingAvailabilityRecipe | null {
  if (!object(value) || Object.keys(value).some(k => !["languageCode", "draft"].includes(k)) ||
      typeof value.languageCode !== "string" || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(value.languageCode) || value.languageCode.length > 35 ||
      !object(value.draft) || Object.keys(value.draft).some(k => !draftKeys.includes(k)) || !isTrainingSetupDraft(value.draft) || value.draft.family === "sentence") return null;
  const draft = canonicalDraft(value.draft);
  if ((!draft.materialMode || draft.materialMode === "collection") && !/^(curated|user):[0-9a-f-]+$/i.test(draft.listValue)) return null;
  if ((!draft.materialMode || draft.materialMode === "collection") && !uuid.test(draft.listValue.split(":")[1])) return null;
  if (draft.sourceValue && draft.sourceValue !== "all" && draft.sourceValue !== "kind:youtube" &&
      !(draft.sourceValue.startsWith("source:") && uuid.test(draft.sourceValue.slice(7)))) return null;
  return { languageCode: value.languageCode, draft };
}

/** Mirrors the established start controller; availability never changes active scope. */
export function availabilityRpcScope(recipe: TrainingAvailabilityRecipe) {
  const { draft, languageCode } = recipe;
  const collection = !draft.materialMode || draft.materialMode === "collection";
  const [listType, listId] = draft.listValue.split(":");
  const filter: TrainingFocusFilter = {
    dateWindow: draft.dateWindow,
    ...(draft.dateWindow === "daysAgo" ? { daysAgo: draft.daysAgo ?? 7 } : {}),
    ...(draft.sourceValue.startsWith("source:") ? { sourceId: draft.sourceValue.slice(7) } : draft.sourceValue === "kind:youtube" ? { sourceKind: "youtube" } : {}),
    ...(draft.partOfSpeech?.length ? { partOfSpeech: [...draft.partOfSpeech].sort() } : {}),
    ...(draft.nounArticles?.length ? { nounArticles: [...draft.nounArticles].sort() } : {}),
    ...(!collection ? { dictionaryScope: { mode: draft.materialMode === "all-dictionaries" ? "all" as const : "selected" as const, languageCode,
      ...(draft.materialMode === "selected-dictionaries" ? { dictionaryIds: [...(draft.dictionaryIds ?? [])].sort() } : {}) } } : {}),
    ...(draft.family === "word-in-context" ? { presentationMode: "word-in-context" as const } : {}),
  };
  return { p_card_type_ids: (draft.family === "idiom" ? draft.modes.map(mode => mode === "word-to-definition" ? "idiom:direct" : "idiom:reverse") : [...draft.modes]).sort(), p_list_id: collection ? listId : null,
    p_list_type: collection ? listType : "curated", p_training_filter: filter,
    p_exercise_family: draft.family === "idiom" ? "idiom" : "meaning" };
}
export function availabilityRecipeKey(recipe: TrainingAvailabilityRecipe) {
  const scope = availabilityRpcScope(recipe);
  return JSON.stringify([recipe.languageCode, scope.p_exercise_family, scope.p_card_type_ids, scope.p_list_id, scope.p_list_type, trainingFilterKey(scope.p_training_filter)]);
}
export function parseTrainingAvailability(value: unknown): TrainingAvailability | null {
  if (!object(value) || !["dueToday", "totalReviews", "newCards"].every(k => typeof value[k] === "number" && Number.isSafeInteger(value[k]) && (value[k] as number) >= 0) ||
      (value.dueToday as number) > (value.totalReviews as number) || typeof value.studyDay !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.studyDay) ||
      typeof value.timezone !== "string" || typeof value.asOf !== "string" || !Number.isFinite(Date.parse(value.asOf))) return null;
  if (!Number.isFinite(Date.parse(value.studyDay + "T00:00:00Z")) || new Date(value.studyDay + "T00:00:00Z").toISOString().slice(0, 10) !== value.studyDay) return null;
  try { new Intl.DateTimeFormat("en", { timeZone: value.timezone }).format(); } catch { return null; }
  return { dueToday: value.dueToday as number, totalReviews: value.totalReviews as number, newCards: value.newCards as number,
    studyDay: value.studyDay, timezone: value.timezone, asOf: value.asOf };
}

/** Scheduling uses a local 04:00 study-day boundary, including DST days. */
export function currentAvailabilityStudyDay(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const day = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  if (Number(values.hour) < 4) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}
