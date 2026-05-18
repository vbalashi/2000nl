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
  const [
    { data: appData, error: appError },
    { data: learningData, error: learningError },
  ] = await Promise.all([
    supabase
      .from("user_settings")
      .select(
          "theme_preference, audio_quality, translation_lang, training_sidebar_pinned, preferences",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.rpc("get_learning_preferences", {
      p_user_id: userId,
    }),
  ]);

  if (appError) {
    console.error("Error fetching app preferences", appError);
  }
  if (learningError) {
    console.error("Error fetching learning preferences", learningError);
  }

  // Translations:
  // - Default to English ("en") when unset/legacy NULL.
  // - Allow explicit "off" via sentinel value stored in DB.
  const translationLang = appData?.translation_lang === "off"
    ? "off"
    : appData?.translation_lang ?? "en";

  // Support both new modes_enabled array and legacy training_mode
  let modesEnabled: TrainingMode[] = learningData?.modes_enabled ?? [];
  if (modesEnabled.length === 0 && learningData?.training_mode) {
    modesEnabled = [learningData.training_mode as TrainingMode];
  }
  if (modesEnabled.length === 0) {
    modesEnabled = ["word-to-definition"];
  }

  // Parse preferences JSONB field (with fallback to empty object)
  const preferences = appData?.preferences ?? {};

  const audioQualityDefault =
    (process.env.NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT as AudioQuality) || "free";
  const audioQuality: AudioQuality =
    appData?.audio_quality === "premium"
      ? "premium"
      : appData?.audio_quality === "free"
        ? "free"
        : audioQualityDefault;

  return {
    themePreference: appData?.theme_preference ?? "system",
    audioQuality,
    modesEnabled,
    cardFilter: (learningData?.card_filter as CardFilter) ?? "both",
    languageCode: learningData?.language_code ?? "nl",
    newReviewRatio: learningData?.new_review_ratio ?? 2,
    activeScenario: learningData?.active_scenario ?? "understanding",
    translationLang,
    trainingSidebarPinned: Boolean(appData?.training_sidebar_pinned ?? false),
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
  const modesEnabled =
    params.modesEnabled ??
    (params.trainingMode !== undefined ? [params.trainingMode] : undefined);
  const hasLearningUpdates =
    modesEnabled !== undefined ||
    params.cardFilter !== undefined ||
    params.languageCode !== undefined ||
    params.newReviewRatio !== undefined ||
    params.activeScenario !== undefined;

  if (hasLearningUpdates) {
    const { error } = await supabase.rpc("update_learning_preferences", {
      p_user_id: params.userId,
      p_modes_enabled: modesEnabled ?? null,
      p_card_filter: params.cardFilter ?? null,
      p_language_code: params.languageCode ?? null,
      p_new_review_ratio: params.newReviewRatio ?? null,
      p_active_scenario: params.activeScenario ?? null,
    });

    if (error) {
      console.error("Error updating learning preferences", error);
      return { error };
    }
  }

  const hasAppUpdates = Object.keys(updates).length > 1;
  if (!hasAppUpdates) {
    return { error: null };
  }

  const { error } = await supabase
    .from("user_settings")
    .upsert(updates, { onConflict: "user_id" });

  if (error) {
    console.error("Error updating user preferences", error);
  }

  return { error };
}
