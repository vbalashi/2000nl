import { useCallback, useEffect, useState } from "react";
import type { AudioQuality } from "@/lib/audio/types";
import { trainingDebug } from "@/lib/trainingDebug";
import type { CardFilter, TrainingMode } from "@/lib/types";
import { fetchUserPreferences, updateUserPreferences } from "../trainingService";

export type ThemePreference = "light" | "dark" | "system";
type PersistOptions = { persist?: boolean };

export function useTrainingPreferences(userId?: string) {
  const [themePreference, setThemePreference] =
    useState<ThemePreference>("system");
  const [audioQuality, setAudioQualityState] = useState<AudioQuality>(
    (process.env.NEXT_PUBLIC_AUDIO_QUALITY_DEFAULT as AudioQuality) || "free",
  );
  const [enabledModes, setEnabledModesState] = useState<TrainingMode[]>([
    "word-to-definition",
  ]);
  const [cardFilter, setCardFilterState] = useState<CardFilter>("both");
  const [language, setLanguageState] = useState("nl");
  const [newReviewRatio, setNewReviewRatioState] = useState(2);
  const [activeScenario, setActiveScenarioState] =
    useState<string>("understanding");
  const [translationLang, setTranslationLangState] = useState<string | null>(
    null,
  );
  const [trainingSidebarPinned, setTrainingSidebarPinnedState] =
    useState(false);

  useEffect(() => {
    if (!userId) return;

    const loadPreferences = async () => {
      const prefs = await fetchUserPreferences(userId);
      trainingDebug.log("[Settings] Loaded preferences from Supabase:", prefs);
      setThemePreference(prefs.themePreference);
      setAudioQualityState(prefs.audioQuality);
      setEnabledModesState(prefs.modesEnabled);
      setCardFilterState(prefs.cardFilter);
      setLanguageState(prefs.languageCode);
      setNewReviewRatioState(prefs.newReviewRatio);
      setActiveScenarioState(prefs.activeScenario);
      setTranslationLangState(prefs.translationLang);
      setTrainingSidebarPinnedState(Boolean(prefs.trainingSidebarPinned));
    };

    void loadPreferences();
  }, [userId]);

  const setTrainingSidebarPinned = useCallback(
    (pinned: boolean) => {
      setTrainingSidebarPinnedState(pinned);
      if (userId) {
        void updateUserPreferences({
          userId,
          trainingSidebarPinned: pinned,
        });
      }
    },
    [userId],
  );

  const setEnabledModes = useCallback(
    (newModes: TrainingMode[], options: PersistOptions = {}) => {
      trainingDebug.log("[Settings] Saving modes to Supabase:", newModes);
      setEnabledModesState(newModes);
      if (userId && options.persist !== false) {
        void updateUserPreferences({ userId, modesEnabled: newModes });
      }
    },
    [userId],
  );

  const setCardFilter = useCallback(
    (newFilter: CardFilter, options: PersistOptions = {}) => {
      trainingDebug.log("[Settings] Saving card filter to Supabase:", newFilter);
      setCardFilterState(newFilter);
      if (userId && options.persist !== false) {
        void updateUserPreferences({ userId, cardFilter: newFilter });
      }
    },
    [userId],
  );

  const setLanguage = useCallback(
    (newLanguage: string) => {
      trainingDebug.log("[Settings] Saving language to Supabase:", newLanguage);
      setLanguageState(newLanguage);
      if (userId) {
        void updateUserPreferences({
          userId,
          languageCode: newLanguage,
        });
      }
    },
    [userId],
  );

  const setTheme = useCallback(
    (newTheme: ThemePreference) => {
      trainingDebug.log("[Settings] Saving theme to Supabase:", newTheme);
      setThemePreference(newTheme);
      if (userId) {
        void updateUserPreferences({
          userId,
          themePreference: newTheme,
        });
      }
    },
    [userId],
  );

  const setAudioQuality = useCallback(
    (quality: AudioQuality) => {
      trainingDebug.log("[Settings] Saving audio quality to Supabase:", quality);
      setAudioQualityState(quality);
      if (userId) {
        void updateUserPreferences({
          userId,
          audioQuality: quality,
        });
      }
    },
    [userId],
  );

  const setNewReviewRatio = useCallback(
    (newRatio: number, options: PersistOptions = {}) => {
      trainingDebug.log("[Settings] Saving new/review ratio to Supabase:", newRatio);
      setNewReviewRatioState(newRatio);
      if (userId && options.persist !== false) {
        void updateUserPreferences({
          userId,
          newReviewRatio: newRatio,
        });
      }
    },
    [userId],
  );

  const setTranslationLang = useCallback(
    (newLang: string | null) => {
      trainingDebug.log(
        "[Settings] Saving translation language to Supabase:",
        newLang,
      );
      setTranslationLangState(newLang);
      if (userId) {
        void updateUserPreferences({
          userId,
          translationLang: newLang,
        });
      }
    },
    [userId],
  );

  const setActiveScenario = useCallback(
    (newScenario: string, options: PersistOptions = {}) => {
      trainingDebug.log(
        "[Settings] Saving active scenario to Supabase:",
        newScenario,
      );
      setActiveScenarioState(newScenario);
      if (userId && options.persist !== false) {
        void updateUserPreferences({
          userId,
          activeScenario: newScenario,
        });
      }
    },
    [userId],
  );

  return {
    activeScenario,
    audioQuality,
    cardFilter,
    enabledModes,
    language,
    newReviewRatio,
    themePreference,
    trainingSidebarPinned,
    translationLang,
    setActiveScenario,
    setAudioQuality,
    setCardFilter,
    setEnabledModes,
    setLanguage,
    setNewReviewRatio,
    setTheme,
    setTrainingSidebarPinned,
    setTranslationLang,
  };
}
