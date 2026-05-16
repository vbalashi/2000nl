import type { AudioQuality } from "../audio/types";
import { supabase } from "../supabaseClient";
import type { CardFilter, TrainingMode } from "../types";

export type UserPreferences = {
  themePreference: "light" | "dark" | "system";
  audioQuality: AudioQuality;
  modesEnabled: TrainingMode[];
  cardFilter: CardFilter;
  languageCode: string;
  newReviewRatio: number;
  /** Active scenario for training (e.g., 'understanding', 'listening') */
  activeScenario: string;
  /** Target language for dictionary tooltips (null = disabled) */
  translationLang: string | null;
  /** Whether the training sidebar is pinned open on desktop */
  trainingSidebarPinned: boolean;
  /** Flexible JSON preferences for features that don't need dedicated columns */
  preferences: {
    onboardingCompleted?: boolean;
    onboardingLanguage?: "en" | "ru" | "nl";
    [key: string]: any; // Allow arbitrary preferences
  };
  /** @deprecated Use modesEnabled instead */
  trainingMode?: TrainingMode;
};

export async function fetchUserPreferences(
  userId: string,
): Promise<UserPreferences> {
  const { data, error } = await supabase
    .from("user_settings")
    .select(
      "theme_preference, audio_quality, training_mode, modes_enabled, card_filter, language_code, new_review_ratio, active_scenario, translation_lang, training_sidebar_pinned, preferences",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user preferences", error);
  }

  // Translations:
  // - Default to English ("en") when unset/legacy NULL.
  // - Allow explicit "off" via sentinel value stored in DB.
  const translationLang =
    data?.translation_lang === "off" ? "off" : data?.translation_lang ?? "en";

  // Support both new modes_enabled array and legacy training_mode
  let modesEnabled: TrainingMode[] = data?.modes_enabled ?? [];
  if (modesEnabled.length === 0 && data?.training_mode) {
    modesEnabled = [data.training_mode as TrainingMode];
  }
  if (modesEnabled.length === 0) {
    modesEnabled = ["word-to-definition"];
  }

  // Parse preferences JSONB field (with fallback to empty object)
  const preferences = data?.preferences ?? {};

  const audioQualityDefault =
    (process.env.NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT as AudioQuality) || "free";
  const audioQuality: AudioQuality =
    data?.audio_quality === "premium"
      ? "premium"
      : data?.audio_quality === "free"
        ? "free"
        : audioQualityDefault;

  return {
    themePreference: data?.theme_preference ?? "system",
    audioQuality,
    modesEnabled,
    cardFilter: (data?.card_filter as CardFilter) ?? "both",
    languageCode: data?.language_code ?? "nl",
    newReviewRatio: data?.new_review_ratio ?? 2,
    activeScenario: data?.active_scenario ?? "understanding",
    translationLang,
    trainingSidebarPinned: Boolean(data?.training_sidebar_pinned ?? false),
    preferences,
    trainingMode: modesEnabled[0],
  };
}

export async function updateUserPreferences(params: {
  userId: string;
  themePreference?: "light" | "dark" | "system";
  audioQuality?: AudioQuality;
  modesEnabled?: TrainingMode[];
  cardFilter?: CardFilter;
  languageCode?: string;
  newReviewRatio?: number;
  activeScenario?: string;
  translationLang?: string | null;
  trainingSidebarPinned?: boolean;
  preferences?: Record<string, any>;
  /** @deprecated Use modesEnabled instead */
  trainingMode?: TrainingMode;
}): Promise<{ error: any }> {
  const updates: Record<string, any> = {
    user_id: params.userId,
  };

  // If we're inserting a new `user_settings` row and `audioQuality` is not
  // provided, avoid silently falling back to the DB default ("free") when the
  // app is configured with a different default (e.g. `AUDIO_QUALITY_DEFAULT=premium`).
  //
  // We only do this for new rows to avoid overwriting explicit user choices.
  if (params.audioQuality === undefined) {
    const { data: existing } = await supabase
      .from("user_settings")
      .select("user_id")
      .eq("user_id", params.userId)
      .maybeSingle();

    if (!existing) {
      updates.audio_quality =
        (process.env.NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT as AudioQuality) ||
        "free";
    }
  }

  if (params.themePreference !== undefined) {
    updates.theme_preference = params.themePreference;
  }
  if (params.audioQuality !== undefined) {
    updates.audio_quality = params.audioQuality;
  }
  if (params.modesEnabled !== undefined) {
    updates.modes_enabled = params.modesEnabled;
    // Also update legacy training_mode for backward compatibility
    updates.training_mode = params.modesEnabled[0] ?? "word-to-definition";
  }
  if (params.cardFilter !== undefined) {
    updates.card_filter = params.cardFilter;
  }
  if (params.languageCode !== undefined) {
    updates.language_code = params.languageCode;
  }
  if (params.newReviewRatio !== undefined) {
    updates.new_review_ratio = params.newReviewRatio;
  }
  if (params.activeScenario !== undefined) {
    updates.active_scenario = params.activeScenario;
  }
  if (params.translationLang !== undefined) {
    updates.translation_lang = params.translationLang;
  }
  if (params.trainingSidebarPinned !== undefined) {
    updates.training_sidebar_pinned = params.trainingSidebarPinned;
  }
  // Handle preferences JSONB field
  if (params.preferences !== undefined) {
    updates.preferences = params.preferences;
  }
  // Handle legacy trainingMode parameter
  if (params.trainingMode !== undefined && params.modesEnabled === undefined) {
    updates.training_mode = params.trainingMode;
    updates.modes_enabled = [params.trainingMode];
  }

  const { error } = await supabase
    .from("user_settings")
    .upsert(updates, { onConflict: "user_id" });

  if (error) {
    console.error("Error updating user preferences", error);
  }

  return { error };
}
