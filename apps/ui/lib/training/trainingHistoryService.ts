import { supabase } from "../supabaseClient";
import type { TrainingMode } from "../types";

export type TrainingHistoryReviewResult =
  | "learning_started"
  | "review_fail"
  | "review_hard"
  | "review_success"
  | "review_easy"
  | "known"
  | "restored"
  | "excluded";

type HistoryIdentity = {
  activityId: string;
  entryId: string;
  headword: string;
  partOfSpeech: string | null;
  meaningText?: string | null;
  contentLanguageCode?: string;
  meaningPosition?: { ordinal: number; total: number };
  reviewResult: TrainingHistoryReviewResult;
  reviewedAt: string;
};

export type RecentTrainingHistoryItem = HistoryIdentity & (
  | { cardTypeId: TrainingMode | "both-directions"; exercise?: never }
  | { cardTypeId: null; exercise: {
      family: "idiom" | "translation";
      direction: "direct" | "reverse" | "recall" | null;
      targetId: string | null;
      text: string | null;
    } }
);

export type RecentTrainingHistoryPage = {
  items: RecentTrainingHistoryItem[];
  hasMore: boolean;
};

type RecentTrainingHistoryRow = {
  activity_id?: unknown;
  meaning_text?: unknown;
  content_language_code?: unknown;
  meaning_ordinal?: unknown;
  meaning_count?: unknown;
  exercise_family?: unknown;
  exercise_direction?: unknown;
  target_id?: unknown;
  exercise_text?: unknown;
  entry_id?: unknown;
  headword?: unknown;
  part_of_speech?: unknown;
  review_result?: unknown;
  card_type_id?: unknown;
  reviewed_at?: unknown;
  has_more?: unknown;
};

const isString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const reviewResults = new Set<TrainingHistoryReviewResult>([
  "learning_started",
  "review_fail",
  "review_hard",
  "review_success",
  "review_easy",
  "known",
  "restored",
  "excluded",
]);
const trainingModes = new Set<TrainingMode>([
  "word-to-definition",
  "definition-to-word",
  "listen-recognize",
  "listen-type",
]);

const isReviewResult = (value: unknown): value is TrainingHistoryReviewResult =>
  typeof value === "string" &&
  reviewResults.has(value as TrainingHistoryReviewResult);
const isTrainingMode = (value: unknown): value is TrainingMode =>
  typeof value === "string" && trainingModes.has(value as TrainingMode);
const isValidTimestamp = (value: unknown): value is string =>
  isString(value) && Number.isFinite(Date.parse(value));

const projectHistoryRow = (
  row: RecentTrainingHistoryRow,
): RecentTrainingHistoryItem => {
  if (
    !isString(row.activity_id) ||
    !isString(row.entry_id) ||
    !isString(row.headword) ||
    !isReviewResult(row.review_result) ||
    !isValidTimestamp(row.reviewed_at) ||
    (row.content_language_code !== undefined && !isString(row.content_language_code)) ||
    (row.meaning_text !== undefined && row.meaning_text !== null && typeof row.meaning_text !== "string") ||
    !((row.meaning_ordinal == null && row.meaning_count == null) ||
      (Number.isSafeInteger(row.meaning_ordinal) && Number.isSafeInteger(row.meaning_count) &&
       Number(row.meaning_ordinal) >= 1 && Number(row.meaning_count) > 1 && Number(row.meaning_ordinal) <= Number(row.meaning_count))) ||
    typeof row.has_more !== "boolean" ||
    (row.part_of_speech !== null &&
      typeof row.part_of_speech !== "string")
  ) {
    throw new Error("training_history_contract_mismatch");
  }

  const ordinary = row.exercise_family === "meaning";
  const exclusionExercise = (row.review_result === "excluded" || row.review_result === "restored") &&
    (row.exercise_family === "idiom" || row.exercise_family === "translation") && row.exercise_direction === null && row.target_id === null;
  const exercise = (row.exercise_family === "idiom" &&
    (row.exercise_direction === "direct" || row.exercise_direction === "reverse")) ||
    (row.exercise_family === "translation" && row.exercise_direction === "recall");
  if (ordinary ? (!(isTrainingMode(row.card_type_id) || (row.card_type_id === "both-directions" && (row.review_result === "known" || row.review_result === "restored"))) || row.exercise_direction !== null ||
      row.target_id !== null || row.exercise_text !== null) :
    (!(exercise || exclusionExercise) || row.card_type_id !== null || (!exclusionExercise && !isString(row.target_id)) ||
      (row.exercise_text !== null && !isString(row.exercise_text)))) {
    throw new Error("training_history_contract_mismatch");
  }

  const identity: HistoryIdentity = {
    activityId: row.activity_id,
    entryId: row.entry_id,
    headword: row.headword,
    partOfSpeech: row.part_of_speech as string | null,
    reviewResult: row.review_result,
    reviewedAt: row.reviewed_at,
    ...(row.meaning_ordinal != null ? { meaningPosition: { ordinal: Number(row.meaning_ordinal), total: Number(row.meaning_count) } } : {}),
    ...(row.content_language_code !== undefined ? { contentLanguageCode: row.content_language_code as string } : {}),
    ...(row.meaning_text !== undefined ? { meaningText: row.meaning_text as string | null } : {}),
  };
  if (ordinary) return { ...identity, cardTypeId: row.card_type_id as TrainingMode | "both-directions" };
  return { ...identity, cardTypeId: null, exercise: {
    family: row.exercise_family as "idiom" | "translation",
    direction: row.exercise_direction as "direct" | "reverse" | "recall" | null,
    targetId: row.target_id as string | null,
    text: row.exercise_text as string | null,
  } };
};

export async function fetchRecentTrainingHistory(signal?: AbortSignal): Promise<RecentTrainingHistoryPage> {
  const query = supabase.rpc(
    "get_recent_training_activity_v2",
    {
      p_limit: 50,
    },
  );
  const { data, error } = await (signal ? query.abortSignal(signal) : query);

  if (error || !Array.isArray(data)) {
    throw new Error("training_history_failed");
  }

  try {
    const rows = data as RecentTrainingHistoryRow[];
    const items = rows.map(projectHistoryRow);
    const hasMoreValue = rows[0]?.has_more ?? false;
    if (typeof hasMoreValue !== "boolean") {
      throw new Error("training_history_contract_mismatch");
    }
    const hasMore = hasMoreValue;
    if (rows.some((row) => row.has_more !== hasMore)) {
      throw new Error("training_history_contract_mismatch");
    }
    return { items, hasMore };
  } catch {
    const invalidIndex = data.findIndex((row) => {
      try {
        projectHistoryRow(row as RecentTrainingHistoryRow);
        return false;
      } catch {
        return true;
      }
    });
    console.error("Invalid recent training history projection", {
      index: invalidIndex < 0 ? 0 : invalidIndex,
    });
    throw new Error("training_history_contract_mismatch");
  }
}
