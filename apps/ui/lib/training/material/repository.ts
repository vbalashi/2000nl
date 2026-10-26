import { withPreferenceDeadline } from "@/lib/preferences/requestDeadline";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emptyMaterialPreferences,
  parseMaterialPreferences,
  parseMaterialPreferencesSnapshot,
  type MaterialPreferences,
} from "./model";
/** Server request-bound authenticated RLS client only; browser callers use client.ts. */
export function createMaterialPreferencesRepository(client: SupabaseClient) {
  return {
    async load(userId: string) {
      const { data, error } = await withPreferenceDeadline((signal) =>
        client
          .from("user_settings")
          .select("material_preferences,material_preferences_revision")
          .eq("user_id", userId)
          .abortSignal(signal)
          .maybeSingle(),
      );
      if (error) throw new Error("material_preferences_unavailable");
      const snapshot = data
        ? parseMaterialPreferencesSnapshot({
            revision: data.material_preferences_revision,
            document: data.material_preferences,
          })
        : emptyMaterialPreferences();
      if (!snapshot) throw new Error("invalid_material_preferences_response");
      return snapshot;
    },
    async save(expectedRevision: number, document: MaterialPreferences) {
      if (
        !parseMaterialPreferences(document) ||
        !Number.isInteger(expectedRevision) ||
        expectedRevision < 0 ||
        expectedRevision >= 2147483647
      )
        throw new Error("invalid_material_preferences");
      const { data, error } = await withPreferenceDeadline((signal) =>
        client
          .rpc("save_account_material_preferences_v1", {
            p_expected_revision: expectedRevision,
            p_document: document,
          })
          .abortSignal(signal),
      );
      if (error) throw new Error("material_preferences_unavailable");
      const snapshot = parseMaterialPreferencesSnapshot(data);
      if (!snapshot || typeof data.conflict !== "boolean")
        throw new Error("invalid_material_preferences_response");
      return {
        kind: data.conflict ? ("conflict" as const) : ("saved" as const),
        snapshot,
      };
    },
  };
}
