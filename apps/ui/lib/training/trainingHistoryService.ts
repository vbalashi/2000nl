import { supabase } from "../supabaseClient";

export type RecentTrainingHistoryItem = {
  entryId: string;
  headword: string;
  partOfSpeech: string | null;
  eventType: string;
  mode: string;
  createdAt: string;
};

type RecentTrainingHistoryRow = {
  id?: unknown;
  headword?: unknown;
  part_of_speech?: unknown;
  event_type?: unknown;
  mode?: unknown;
  created_at?: unknown;
};

const isString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const projectHistoryRow = (
  row: RecentTrainingHistoryRow,
): RecentTrainingHistoryItem | null => {
  if (
    !isString(row.id) ||
    !isString(row.headword) ||
    !isString(row.event_type) ||
    !isString(row.mode) ||
    !isString(row.created_at)
  ) {
    return null;
  }

  return {
    entryId: row.id,
    headword: row.headword,
    partOfSpeech:
      typeof row.part_of_speech === "string" ? row.part_of_speech : null,
    eventType: row.event_type,
    mode: row.mode,
    createdAt: row.created_at,
  };
};

export async function fetchRecentTrainingHistory(
  userId: string,
): Promise<RecentTrainingHistoryItem[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.rpc("get_recent_training_history", {
    p_user_id: userId,
    p_since: since,
    p_limit: 50,
  });

  if (error || !Array.isArray(data)) {
    throw new Error("training_history_failed");
  }

  return data
    .map((row) => projectHistoryRow(row as RecentTrainingHistoryRow))
    .filter((row): row is RecentTrainingHistoryItem => row !== null);
}
