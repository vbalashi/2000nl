import { supabase } from "@/lib/supabaseClient";

/** IDs only: readable Library collections keep their independent catalog. */
export async function fetchEnabledCuratedTrainingListIds(languageCode: string): Promise<string[]> {
  const { data, error } = await supabase.rpc("get_enabled_curated_training_list_ids_v1", {
    p_language_code: languageCode,
  });
  if (error || !Array.isArray(data) || data.some((row) => typeof row?.id !== "string"))
    throw error ?? new Error("curated_training_material_unavailable");
  return data.map((row) => row.id as string);
}
