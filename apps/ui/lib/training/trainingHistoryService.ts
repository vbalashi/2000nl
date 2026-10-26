import { supabase } from "../supabaseClient";
import type { TrainingMode } from "../types";

export type TrainingHistoryReviewResult =
  | "learning_started"
  | "review_fail"
  | "review_hard"
  | "review_success"
  | "review_easy";

type HistoryIdentity = {
  activityId: string;
  entryId: string;
  headword: string;
  partOfSpeech: string | null;
  reviewResult: TrainingHistoryReviewResult;
  reviewedAt: string;
};

export type RecentTrainingHistoryItem = HistoryIdentity & (
  | { cardTypeId: TrainingMode; exercise?: never }
  | { cardTypeId: null; exercise: {
      family: "idiom" | "translation";
      direction: "direct" | "reverse" | "recall";
      targetId: string;
      text: string | null;
    } }
);

export type RecentTrainingHistoryPage = {
  items: RecentTrainingHistoryItem[];
  hasMore: boolean;
};

type RecentTrainingHistoryRow = {
  activity_id?: unknown;
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
    typeof row.has_more !== "boolean" ||
    (row.part_of_speech !== null &&
      typeof row.part_of_speech !== "string")
  ) {
    throw new Error("training_history_contract_mismatch");
  }

  const ordinary = row.exercise_family === "meaning";
  const exercise = (row.exercise_family === "idiom" &&
    (row.exercise_direction === "direct" || row.exercise_direction === "reverse")) ||
    (row.exercise_family === "translation" && row.exercise_direction === "recall");
  if (ordinary ? (!isTrainingMode(row.card_type_id) || row.exercise_direction !== null ||
      row.target_id !== null || row.exercise_text !== null) :
    (!exercise || row.card_type_id !== null || !isString(row.target_id) ||
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
  };
  if (ordinary) return { ...identity, cardTypeId: row.card_type_id as TrainingMode };
  return { ...identity, cardTypeId: null, exercise: {
    family: row.exercise_family as "idiom" | "translation",
    direction: row.exercise_direction as "direct" | "reverse" | "recall",
    targetId: row.target_id as string,
    text: row.exercise_text as string | null,
  } };
};

export async function fetchRecentTrainingHistory(signal?: AbortSignal): Promise<RecentTrainingHistoryPage> {
  const query = supabase.rpc(
    "get_recent_training_activity_v1",
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
