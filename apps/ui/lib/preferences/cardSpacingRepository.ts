import { supabase } from "@/lib/supabaseClient";
import {
  isCardSpacing,
  type CardSpacing,
} from "@/components/practice/ui/cardSpacing";
import { withPreferenceDeadline } from "./requestDeadline";
export interface CardSpacingRepository {
  load(userId: string): Promise<CardSpacing>;
  save(userId: string, spacing: CardSpacing): Promise<void>;
}
export const cardSpacingRepository: CardSpacingRepository = {
  async load(userId) {
    const { data, error } = await withPreferenceDeadline((signal) =>
      supabase
        .from("user_settings")
        .select("card_spacing")
        .eq("user_id", userId)
        .abortSignal(signal)
        .maybeSingle(),
    );
    if (error) throw new Error("card_spacing_load_failed");
    return isCardSpacing(data?.card_spacing) ? data.card_spacing : "balanced";
  },
  async save(userId, spacing) {
    if (!isCardSpacing(spacing)) throw new Error("invalid_card_spacing");
    const { error } = await withPreferenceDeadline((signal) =>
      supabase
        .from("user_settings")
        .upsert(
          { user_id: userId, card_spacing: spacing },
          { onConflict: "user_id" },
        )
        .abortSignal(signal),
    );
    if (error) throw new Error("card_spacing_save_failed");
  },
};
