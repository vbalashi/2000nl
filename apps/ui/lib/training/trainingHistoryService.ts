import { supabase } from "../supabaseClient";
import type { TrainingMode } from "../types";

export type TrainingHistoryReviewResult =
  | "review_fail"
  | "review_hard"
  | "review_success"
  | "review_easy";

export type RecentTrainingHistoryItem = {
  entryId: string;
  headword: string;
  partOfSpeech: string | null;
  reviewResult: TrainingHistoryReviewResult;
  cardTypeId: TrainingMode;
  reviewedAt: string;
};

export type RecentTrainingHistoryPage = {
  items: RecentTrainingHistoryItem[];
  hasMore: boolean;
};

type RecentTrainingHistoryRow = {
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
    !isString(row.entry_id) ||
    !isString(row.headword) ||
    !isReviewResult(row.review_result) ||
    !isTrainingMode(row.card_type_id) ||
    !isValidTimestamp(row.reviewed_at) ||
    typeof row.has_more !== "boolean" ||
    (row.part_of_speech !== null &&
      typeof row.part_of_speech !== "string")
  ) {
    throw new Error("training_history_contract_mismatch");
  }

  return {
    entryId: row.entry_id,
    headword: row.headword,
    partOfSpeech:
      typeof row.part_of_speech === "string" ? row.part_of_speech : null,
    reviewResult: row.review_result,
    cardTypeId: row.card_type_id,
    reviewedAt: row.reviewed_at,
  };
};

export async function fetchRecentTrainingHistory(): Promise<RecentTrainingHistoryPage> {
  const { data, error } = await supabase.rpc(
    "get_recent_training_review_history",
    {
      p_limit: 50,
    },
  );

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
