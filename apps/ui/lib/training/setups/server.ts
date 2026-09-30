import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyTrainingSetups, parseTrainingSetupsSnapshot, type TrainingSetupsSnapshot } from "./model";

/** Uses only the authenticated RLS client, never the service-role client. */
export async function readAccountTrainingSetups(client: SupabaseClient, userId: string): Promise<TrainingSetupsSnapshot | null> {
  const { data, error } = await client.from("user_settings")
    .select("training_setups, training_setups_revision").eq("user_id", userId).maybeSingle();
  if (error) return null;
  if (!data) return emptyTrainingSetups();
  return parseTrainingSetupsSnapshot({ revision: data.training_setups_revision, document: data.training_setups });
}
