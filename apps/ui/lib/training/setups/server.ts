import type { SupabaseClient } from "@supabase/supabase-js";
import { parseTrainingSetupsSnapshot, type TrainingSetupsSnapshot } from "./model";

/** The database derives the principal and reads setup and starter status atomically. */
export async function readAccountTrainingSetups(client: SupabaseClient, _userId: string): Promise<TrainingSetupsSnapshot | null> {
  const { data, error } = await client.rpc("read_account_starter_snapshot_v1");
  if (error || !data || typeof data.starterStatus !== "string") return null;
  return parseTrainingSetupsSnapshot(data);
}
