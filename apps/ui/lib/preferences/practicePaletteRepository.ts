import { supabase } from "@/lib/supabaseClient";
import {
  isPracticePalette,
  type PracticePalette,
} from "@/components/practice/ui/appearance";
import { withPreferenceDeadline } from "./requestDeadline";
export interface PracticePaletteRepository {
  load(userId: string): Promise<PracticePalette>;
  save(userId: string, palette: PracticePalette): Promise<void>;
}
export const practicePaletteRepository: PracticePaletteRepository = {
  async load(userId) {
    const { data, error } = await withPreferenceDeadline((signal) =>
      supabase
        .from("user_settings")
        .select("practice_palette")
        .eq("user_id", userId)
        .abortSignal(signal)
        .maybeSingle(),
    );
    if (error) throw new Error("practice_palette_load_failed");
    return isPracticePalette(data?.practice_palette)
      ? data.practice_palette
      : "lavender";
  },
  async save(userId, palette) {
    if (!isPracticePalette(palette))
      throw new Error("invalid_practice_palette");
    const { error } = await withPreferenceDeadline((signal) =>
      supabase
        .from("user_settings")
        .upsert(
          { user_id: userId, practice_palette: palette },
          { onConflict: "user_id" },
        )
        .abortSignal(signal),
    );
    if (error) throw new Error("practice_palette_save_failed");
  },
};
